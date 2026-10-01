package main

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	listenAddr = "127.0.0.1:17865"
	baseURL    = "http://127.0.0.1:17865"
)

var (
	version    = "dev"
	uriAttrRE  = regexp.MustCompile(`URI="([^"]+)"`)
	httpClient = &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many redirects")
			}
			normalized, err := normalizeUpstream(req.URL)
			if err != nil {
				return errors.New("redirect outside allowed 115 hosts")
			}
			req.URL = normalized
			return nil
		},
	}
)

func main() {
	setupLog()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", withCORS(healthHandler))
	mux.HandleFunc("/proxy", withCORS(proxyHandler))

	server := &http.Server{
		Addr:              listenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ln, err := net.Listen("tcp", listenAddr)
	if err != nil {
		log.Printf("listen failed: %v", err)
		return
	}
	log.Printf("HomeSphere Player Helper %s listening on %s", version, listenAddr)

	if err := server.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Printf("server stopped: %v", err)
	}
}

func setupLog() {
	dir := filepath.Join(os.Getenv("LOCALAPPDATA"), "HomeSphere")
	if dir == "HomeSphere" {
		dir = os.TempDir()
	}
	_ = os.MkdirAll(dir, 0o755)

	f, err := os.OpenFile(filepath.Join(dir, "player-helper.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err == nil {
		log.SetOutput(f)
	}
	log.SetFlags(log.Ldate | log.Ltime | log.LUTC)
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" {
			if !allowedPageOrigin(origin) {
				http.Error(w, "origin not allowed", http.StatusForbidden)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Range, Content-Type, Accept")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type")
		w.Header().Set("Access-Control-Allow-Private-Network", "true")
		w.Header().Set("Cache-Control", "no-store")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		next(w, r)
	}
}

func allowedPageOrigin(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" {
		return false
	}
	if u.Scheme == "https" {
		return true
	}
	host := strings.ToLower(u.Hostname())
	return u.Scheme == "http" && (host == "localhost" || host == "127.0.0.1")
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":      true,
		"name":    "HomeSphere Player Helper",
		"version": version,
	})
}

func proxyHandler(w http.ResponseWriter, r *http.Request) {
	rawTarget := strings.TrimSpace(r.URL.Query().Get("url"))
	if rawTarget == "" {
		http.Error(w, "missing url", http.StatusBadRequest)
		return
	}

	target, err := decodeTarget(rawTarget)
	if err != nil {
		http.Error(w, "invalid url", http.StatusBadRequest)
		return
	}
	target, err = normalizeUpstream(target)
	if err != nil {
		http.Error(w, "upstream host not allowed", http.StatusForbidden)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target.String(), nil)
	if err != nil {
		http.Error(w, "cannot create upstream request", http.StatusBadGateway)
		return
	}

	if ua := strings.TrimSpace(r.UserAgent()); ua != "" {
		req.Header.Set("User-Agent", ua)
	}
	if accept := strings.TrimSpace(r.Header.Get("Accept")); accept != "" {
		req.Header.Set("Accept", accept)
	}
	if value := strings.TrimSpace(r.Header.Get("Range")); value != "" {
		req.Header.Set("Range", value)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		http.Error(w, "115 request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	isPlaylist := strings.Contains(contentType, "mpegurl") || strings.HasSuffix(strings.ToLower(target.Path), ".m3u8")

	if isPlaylist {
		body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
		if err != nil {
			http.Error(w, "playlist read failed", http.StatusBadGateway)
			return
		}
		rewritten, err := rewritePlaylist(string(body), target)
		if err != nil {
			http.Error(w, "playlist rewrite failed", http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.WriteString(w, rewritten)
		return
	}

	copyHeaderIfPresent(w.Header(), resp.Header, "Content-Type")
	copyHeaderIfPresent(w.Header(), resp.Header, "Content-Length")
	copyHeaderIfPresent(w.Header(), resp.Header, "Content-Range")
	copyHeaderIfPresent(w.Header(), resp.Header, "Accept-Ranges")
	copyHeaderIfPresent(w.Header(), resp.Header, "ETag")
	copyHeaderIfPresent(w.Header(), resp.Header, "Last-Modified")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func decodeTarget(value string) (*url.URL, error) {
	if strings.HasPrefix(value, "b64.") {
		decoded, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(value, "b64."))
		if err != nil {
			return nil, err
		}
		value = string(decoded)
	}
	u, err := url.Parse(value)
	if err != nil || u.Scheme == "" || u.Hostname() == "" {
		return nil, errors.New("invalid target")
	}
	return u, nil
}

func allowed115Host(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	for _, domain := range []string{"115.com", "115cdn.net", "115vod.com"} {
		if host == domain || strings.HasSuffix(host, "."+domain) {
			return true
		}
	}
	return false
}

func normalizeUpstream(u *url.URL) (*url.URL, error) {
	if u == nil || u.User != nil || !allowed115Host(u.Hostname()) {
		return nil, errors.New("upstream host not allowed")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, errors.New("upstream scheme not allowed")
	}
	normalized := *u
	// 115 occasionally returns an http:// HLS URL even though the same endpoint
	// is available over TLS. Upgrade it locally rather than allowing plaintext
	// upstream traffic from the helper.
	if normalized.Scheme == "http" {
		normalized.Scheme = "https"
	}
	return &normalized, nil
}

func allowedUpstream(u *url.URL) bool {
	return u != nil && u.Scheme == "https" && u.User == nil && allowed115Host(u.Hostname())
}

func rewritePlaylist(text string, base *url.URL) (string, error) {
	var out strings.Builder
	scanner := bufio.NewScanner(strings.NewReader(text))
	scanner.Buffer(make([]byte, 64*1024), 2<<20)

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		switch {
		case trimmed == "":
			out.WriteString(line)
		case strings.HasPrefix(trimmed, "#"):
			line = uriAttrRE.ReplaceAllStringFunc(line, func(match string) string {
				parts := uriAttrRE.FindStringSubmatch(match)
				if len(parts) != 2 {
					return match
				}
				absolute, err := base.Parse(parts[1])
				if err != nil {
					return match
				}
				absolute, err = normalizeUpstream(absolute)
				if err != nil {
					return match
				}
				return fmt.Sprintf(`URI="%s"`, helperURL(absolute))
			})
			out.WriteString(line)
		default:
			absolute, err := base.Parse(trimmed)
			if err != nil {
				return "", errors.New("playlist references invalid URL")
			}
			absolute, err = normalizeUpstream(absolute)
			if err != nil {
				return "", errors.New("playlist references disallowed host")
			}
			out.WriteString(helperURL(absolute))
		}
		out.WriteByte('\n')
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	return out.String(), nil
}

func helperURL(target *url.URL) string {
	encoded := base64.RawURLEncoding.EncodeToString([]byte(target.String()))
	return baseURL + "/proxy?url=b64." + encoded
}

func copyHeaderIfPresent(dst, src http.Header, name string) {
	if value := src.Get(name); value != "" {
		dst.Set(name, value)
	}
}

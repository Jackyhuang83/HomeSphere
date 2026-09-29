package main

import (
	"net/url"
	"strings"
	"testing"
)

func TestAllowedUpstream(t *testing.T) {
	cases := []struct {
		raw  string
		want bool
	}{
		{"https://cpats01.115.com/a.m3u8", true},
		{"https://115.com/a", true},
		{"https://dl.115cdn.net/a.ts", true},
		{"https://foo.115vod.com/a.m3u8", true},
		{"http://cpats01.115.com/a.m3u8", false},
		{"https://evil.example/115.com/a", false},
	}
	for _, tc := range cases {
		u, _ := url.Parse(tc.raw)
		if got := allowedUpstream(u); got != tc.want {
			t.Fatalf("%s: got %v want %v", tc.raw, got, tc.want)
		}
	}
}

func TestRewritePlaylist(t *testing.T) {
	base, _ := url.Parse("https://cpats01.115.com/path/master.m3u8")
	input := strings.Join([]string{
		"#EXTM3U",
		"#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"audio\",URI=\"audio/index.m3u8\"",
		"#EXT-X-STREAM-INF:BANDWIDTH=1000,AUDIO=\"audio\"",
		"video/index.m3u8",
		"",
	}, "\n")

	out, err := rewritePlaylist(input, base)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "http://127.0.0.1:17865/proxy?url=b64.") {
		t.Fatalf("rewritten playlist does not point at helper: %s", out)
	}
	if strings.Contains(out, "URI=\"audio/index.m3u8\"") || strings.Contains(out, "\nvideo/index.m3u8\n") {
		t.Fatalf("relative URLs were not rewritten: %s", out)
	}
}

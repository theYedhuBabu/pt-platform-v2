package hubapi

import (
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	hubconfig "pt-platform-v2/internal/hub-config"

	"github.com/gin-gonic/gin"
)

// newReverseProxy builds a gin handler that proxies to target.
//
// When stripPrefix is non-empty it is removed from the request path before
// forwarding — used for upstreams that serve from root (e.g. ClickHouse, which
// answers queries at "/"). Grafana is proxied with its "/grafana" prefix intact
// and relies on GF_SERVER_SERVE_FROM_SUB_PATH=true so its own redirects and
// asset URLs stay consistent.
func newReverseProxy(target *url.URL, stripPrefix string) gin.HandlerFunc {
	proxy := httputil.NewSingleHostReverseProxy(target)

	baseDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		// Capture the client-facing host/scheme BEFORE baseDirector rewrites them,
		// so the upstream (Grafana) can build correct external absolute + wss:// URLs.
		// Honour values already set by an outer proxy (ngrok sends X-Forwarded-*).
		fwdHost := req.Header.Get("X-Forwarded-Host")
		if fwdHost == "" {
			fwdHost = req.Host
		}
		fwdProto := req.Header.Get("X-Forwarded-Proto")
		if fwdProto == "" {
			if req.TLS != nil {
				fwdProto = "https"
			} else {
				fwdProto = "http"
			}
		}

		baseDirector(req) // sets scheme/host and rewrites the path against target
		if stripPrefix != "" {
			req.URL.Path = strings.TrimPrefix(req.URL.Path, stripPrefix)
			if !strings.HasPrefix(req.URL.Path, "/") {
				req.URL.Path = "/" + req.URL.Path
			}
		}

		req.Header.Set("X-Forwarded-Host", fwdHost)
		req.Header.Set("X-Forwarded-Proto", fwdProto)
		// Preserve the client-facing Host header (do NOT rewrite to target.Host):
		// Grafana's CSRF/origin middleware compares the request Origin against the
		// served host, so a rewritten Host yields "origin not allowed" on POSTs
		// (e.g. datasource Save & Test). The TCP dial still targets the upstream
		// via req.URL.Host; only the Host header is kept as the original. ClickHouse
		// ignores Host, so this is safe for both upstreams.
		req.Host = fwdHost
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Error("reverse proxy upstream error",
			"target", target.String(), "path", r.URL.Path, "error", err)
		w.WriteHeader(http.StatusBadGateway)
	}

	return func(c *gin.Context) {
		proxy.ServeHTTP(c.Writer, c.Request)
	}
}

// registerProxies mounts single-port reverse proxies so Grafana and ClickHouse
// are reachable under the hub's own origin (e.g. through one ngrok tunnel):
//
//	{host}/grafana    → cfg.GrafanaBaseURL   (prefix preserved)
//	{host}/clickhouse → cfg.ClickHouseURL    (prefix stripped)
func registerProxies(r *gin.Engine, cfg *hubconfig.Config) {
	if cfg.GrafanaBaseURL != "" {
		if target, err := url.Parse(cfg.GrafanaBaseURL); err == nil {
			h := newReverseProxy(target, "")
			r.Any("/grafana", h)
			r.Any("/grafana/*proxyPath", h)
		} else {
			slog.Warn("invalid GRAFANA_BASE_URL — /grafana proxy disabled", "value", cfg.GrafanaBaseURL, "error", err)
		}
	}

	if cfg.ClickHouseURL != "" {
		if target, err := url.Parse(cfg.ClickHouseURL); err == nil {
			h := newReverseProxy(target, "/clickhouse")
			r.Any("/clickhouse", h)
			r.Any("/clickhouse/*proxyPath", h)
		} else {
			slog.Warn("invalid CLICKHOUSE_URL — /clickhouse proxy disabled", "value", cfg.ClickHouseURL, "error", err)
		}
	}
}

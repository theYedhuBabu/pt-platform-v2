package hubapi

import (
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	hubconfig "pt-platform-v2/internal/hub-config"
	"pt-platform-v2/internal/tools/jmeter"

	"github.com/gin-gonic/gin"
)

// --- JMX Parser ---

// parseJmx accepts a JMX file upload and returns the CSV property names it references.
func parseJmx(c *gin.Context) {
	file, _, err := c.Request.FormFile("jmx")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "jmx file required"})
		return
	}
	defer file.Close()
	content, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to read file"})
		return
	}
	csvVars := jmeter.ParseRequiredCSVsFromBytes(content)
	c.JSON(http.StatusOK, gin.H{"success": true, "csvVars": csvVars})
}

// --- Script Upload ---

func uploadScript(cfg *hubconfig.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		frameworkID := c.PostForm("frameworkId")
		if frameworkID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "frameworkId required"})
			return
		}

		baseDir := filepath.Join(cfg.ScriptsDir, "frameworks", frameworkID)
		scriptsDir := filepath.Join(baseDir, "scripts")
		dataDir := filepath.Join(baseDir, "data")

		for _, dir := range []string{scriptsDir, dataDir} {
			if err := os.MkdirAll(dir, 0755); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to create directories"})
				return
			}
		}

		paths := map[string]string{}

		// Store JMX
		if jmxFile, jmxHeader, err := c.Request.FormFile("jmx"); err == nil {
			defer jmxFile.Close()
			dest := filepath.Join(scriptsDir, filepath.Base(jmxHeader.Filename))
			if err := saveFile(jmxFile, dest); err != nil {
				slog.Error("Failed to save JMX", "dest", dest, "error", err)
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to save jmx"})
				return
			}
			paths["jmx"] = dest
		}

		// Store CSVs (field name "csv[]" or "csv")
		if err := c.Request.ParseMultipartForm(64 << 20); err == nil {
			for _, fheaders := range c.Request.MultipartForm.File {
				for _, fh := range fheaders {
					if strings.HasSuffix(strings.ToLower(fh.Filename), ".csv") {
						f, err := fh.Open()
						if err != nil {
							continue
						}
						dest := filepath.Join(dataDir, filepath.Base(fh.Filename))
						if saveErr := saveFile(f, dest); saveErr != nil {
							f.Close()
							slog.Warn("Failed to save CSV", "file", fh.Filename, "error", saveErr)
							continue
						}
						f.Close()
						paths[fh.Filename] = dest
					}
				}
			}
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "paths": paths})
	}
}

func saveFile(src io.Reader, dest string) error {
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, src)
	return err
}

// --- Static Framework Asset Serving ---

func staticFrameworkAsset(cfg *hubconfig.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		fid := c.Param("fid")
		assetPath := c.Param("assetPath")
		// Prevent path traversal
		clean := filepath.Clean("/" + assetPath)
		if strings.Contains(clean, "..") {
			c.Status(http.StatusForbidden)
			return
		}
		fullPath := filepath.Join(cfg.ScriptsDir, "frameworks", fid, clean)
		c.File(fullPath)
	}
}

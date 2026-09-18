package hubapi

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"pt-platform-v2/internal/database"
	hubconfig "pt-platform-v2/internal/hub-config"
	"pt-platform-v2/internal/tools"
	"pt-platform-v2/internal/tools/jmeter"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// --- Frameworks ---

func getFrameworks(c *gin.Context) {
	projectID := c.Query("projectId")
	var (
		frameworks []database.Framework
		err        error
	)
	if projectID != "" {
		frameworks, err = database.GetFrameworksByProject(projectID)
	} else {
		frameworks, err = database.GetAllFrameworks()
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": frameworks})
}

func getFrameworkByID(c *gin.Context) {
	f, err := database.GetFrameworkByID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "framework not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": f})
}

func createFramework(cfg *hubconfig.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		now := time.Now().UTC().Format(time.RFC3339)
		f := database.Framework{
			ID:           uuid.New().String(),
			ProjectID:    formVal(c, "projectId"),
			Name:         formVal(c, "name"),
			Description:  formVal(c, "description"),
			SourceType:   formVal(c, "sourceType"),
			SourceRepo:   formVal(c, "sourceRepo"),
			SourceBranch: formVal(c, "sourceBranch"),
			Version:      formVal(c, "version"),
			Envs:         formValDefault(c, "envs", "[]"),
			ScriptCount:  formIntAny(c, "scripts", "scriptCount"),
			ConfigCount:  formIntAny(c, "configs", "configCount"),
			DataCount:    formIntAny(c, "data", "dataCount"),
			PluginCount:  formIntAny(c, "plugins", "pluginCount"),
			UtilCount:    formIntAny(c, "util", "utilCount"),
			ToolType:     formVal(c, "toolType"),
			SplitFiles:   formValDefault(c, "splitFiles", "[]"),
			SharedFiles:  formValDefault(c, "sharedFiles", "[]"),
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		if f.ProjectID == "" || f.Name == "" || f.SourceType == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "projectId, name and sourceType are required"})
			return
		}
		if err := saveFrameworkUploadFiles(c, cfg, f.ID); err != nil {
			slog.Error("Failed to save framework files", "id", f.ID, "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to save framework files"})
			return
		}
		if err := database.InsertFramework(f); err != nil {
			slog.Error("Failed to insert framework", "id", f.ID, "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to save framework"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "id": f.ID, "framework": f})
	}
}

func deleteFramework(c *gin.Context) {
	if _, err := database.DB.Exec(`DELETE FROM Frameworks WHERE ID=?`, c.Param("id")); err != nil {
		slog.Error("Failed to delete framework", "id", c.Param("id"), "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to delete framework"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// --- FrameworkTypes (Settings) ---

func getFrameworkTypes(c *gin.Context) {
	types, err := database.GetFrameworkTypes()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": types})
}

type frameworkTypeReq struct {
	Name      string `json:"name"`
	Tool      string `json:"tool"` // canonical runtime — must be in tools.Supported
	Label     string `json:"label"`
	Structure string `json:"structure"` // raw JSON string
}

func getSupportedTools(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"success": true, "data": tools.Supported})
}

func createFrameworkType(c *gin.Context) {
	var req frameworkTypeReq
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" || req.Label == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "name, label and structure required"})
		return
	}
	if !tools.IsSupported(req.Tool) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "tool must be one of: " + tools.SupportedList()})
		return
	}
	if req.Structure == "" {
		req.Structure = "{}"
	}
	now := time.Now().UTC().Format(time.RFC3339)
	ft := database.FrameworkType{
		ID:        uuid.New().String(),
		Name:      req.Name,
		Tool:      req.Tool,
		Label:     req.Label,
		Structure: req.Structure,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := database.InsertFrameworkType(ft); err != nil {
		slog.Error("Failed to insert framework type", "name", req.Name, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to save framework type"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "name": ft.Name})
}

func updateFrameworkType(c *gin.Context) {
	var req frameworkTypeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid payload"})
		return
	}
	if !tools.IsSupported(req.Tool) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "tool must be one of: " + tools.SupportedList()})
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := database.UpdateFrameworkType(c.Param("name"), req.Tool, req.Label, req.Structure, now); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to update framework type"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func deleteFrameworkTypeHandler(c *gin.Context) {
	if err := database.DeleteFrameworkType(c.Param("name")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to delete framework type"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// formVal reads a field from either multipart form or query params.
func formVal(c *gin.Context, key string) string {
	if v := c.PostForm(key); v != "" {
		return v
	}
	return c.Query(key)
}

func formValDefault(c *gin.Context, key, def string) string {
	if v := formVal(c, key); v != "" {
		return v
	}
	return def
}

func formIntAny(c *gin.Context, keys ...string) int {
	for _, key := range keys {
		v := formVal(c, key)
		if v == "" {
			continue
		}
		n, err := strconv.Atoi(v)
		if err == nil {
			return n
		}
	}
	return 0
}

func saveFrameworkUploadFiles(c *gin.Context, cfg *hubconfig.Config, frameworkID string) error {
	if cfg == nil || frameworkID == "" {
		return nil
	}
	if err := c.Request.ParseMultipartForm(512 << 20); err != nil {
		if !strings.Contains(c.GetHeader("Content-Type"), "multipart/form-data") {
			return nil
		}
		return err
	}
	if c.Request.MultipartForm == nil || len(c.Request.MultipartForm.File) == 0 {
		return nil
	}

	baseDir := filepath.Join(cfg.ScriptsDir, "frameworks", frameworkID)

	// Attempt to read client-provided relative paths array. Frontends that
	// cannot embed paths in part headers should include a `paths` form array
	// with the same ordering as the `files` parts.
	var paths []string
	if c.Request.MultipartForm != nil {
		// check several common keys
		if v, ok := c.Request.MultipartForm.Value["paths"]; ok {
			paths = v
		} else if v, ok := c.Request.MultipartForm.Value["paths[]"]; ok {
			paths = v
		} else if v, ok := c.Request.MultipartForm.Value["filePaths"]; ok {
			paths = v
		} else if v, ok := c.Request.MultipartForm.Value["filePaths[]"]; ok {
			paths = v
		}
	}

	// If the client sent files under a single repeated field name `files`,
	// prefer that ordered slice so we can map paths[i] -> files[i].
	if headers, ok := c.Request.MultipartForm.File["files"]; ok && len(headers) > 0 {
		for i, header := range headers {
			// Prefer the explicit paths[] entry when available and lengths match.
			var relPath string
			if len(paths) == len(headers) {
				relPath = cleanFrameworkUploadPath(paths[i])
			} else {
				relPath = cleanFrameworkUploadPath(header.Filename)
			}
			slog.Info("framework upload part", "frameworkID", frameworkID, "headerFilename", header.Filename, "relPath", relPath)
			if relPath == "" {
				continue
			}
			src, err := header.Open()
			if err != nil {
				return err
			}
			dest := filepath.Join(baseDir, filepath.FromSlash(relPath))
			if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
				src.Close()
				return err
			}
			if err := saveFile(src, dest); err != nil {
				src.Close()
				return err
			}
			src.Close()
		}
		return nil
	}

	// Fallback: iterate all file fields (unordered map). Use header.Filename.
	// But first, handle a single ZIP/archive upload: if any uploaded part
	// is a .zip (field name `archive` or any file with .zip suffix), extract
	// it and return.
	for _, headers := range c.Request.MultipartForm.File {
		for _, header := range headers {
			if strings.HasSuffix(strings.ToLower(header.Filename), ".zip") {
				// Open and read the zip content into memory
				src, err := header.Open()
				if err != nil {
					return err
				}
				data, err := io.ReadAll(src)
				src.Close()
				if err != nil {
					return err
				}
				zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
				if err != nil {
					return err
				}
				for _, f := range zr.File {
					// skip directories
					if f.FileInfo().IsDir() {
						continue
					}
					// sanitize path
					n := path.Clean(f.Name)
					if strings.Contains(n, "..") || n == "." || n == "/" {
						continue
					}
					relPath := strings.TrimPrefix(n, "/")
					relPath = cleanFrameworkUploadPath(relPath)
					if relPath == "" {
						continue
					}
					rc, err := f.Open()
					if err != nil {
						return err
					}
					dest := filepath.Join(baseDir, filepath.FromSlash(relPath))
					if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
						rc.Close()
						return err
					}
					if err := saveFile(rc, dest); err != nil {
						rc.Close()
						return err
					}
					rc.Close()
				}
				return nil
			}
		}
	}
	for _, headers := range c.Request.MultipartForm.File {
		for _, header := range headers {
			relPath := cleanFrameworkUploadPath(header.Filename)
			slog.Info("framework upload part", "frameworkID", frameworkID, "headerFilename", header.Filename, "relPath", relPath)
			if relPath == "" {
				continue
			}
			src, err := header.Open()
			if err != nil {
				return err
			}
			dest := filepath.Join(baseDir, filepath.FromSlash(relPath))
			if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
				src.Close()
				return err
			}
			if err := saveFile(src, dest); err != nil {
				src.Close()
				return err
			}
			src.Close()
		}
	}
	return nil
}

func cleanFrameworkUploadPath(filename string) string {
	normalized := strings.ReplaceAll(filename, "\\", "/")
	for _, part := range strings.Split(normalized, "/") {
		if part == ".." {
			return ""
		}
	}
	clean := path.Clean("/" + normalized)
	if clean == "/" {
		return ""
	}
	return strings.TrimPrefix(clean, "/")
}

// --- Framework File Listing ---

// FrameworkFileSet groups files found on disk by their structural role.
type FrameworkFileSet struct {
	Entrypoints []string `json:"entrypoints"`
	DataFiles   []string `json:"dataFiles"`
	Configs     []string `json:"configs"`
	Plugins     []string `json:"plugins"`
	Util        []string `json:"util"`
}

type fileRole int

const (
	fileRoleNone fileRole = iota // no role tag anywhere on the path — excluded from listings
	fileRoleConfig
	fileRoleEntrypoint
	fileRoleData
	fileRolePlugin
	fileRoleUtil
)

func roleFromTag(tag string, fallback fileRole) fileRole {
	switch tag {
	case "plugin":
		return fileRolePlugin
	case "util":
		return fileRoleUtil
	case "config":
		return fileRoleConfig
	default:
		return fallback
	}
}

func segmentMatches(pattern, segment string) bool {
	if pattern == segment {
		return true
	}
	matched, err := filepath.Match(pattern, segment)
	return err == nil && matched
}

func fileMatches(pattern string, node database.StructNode, segment string) bool {
	if !segmentMatches(pattern, segment) {
		return false
	}
	if node.Ext == "" {
		return true
	}
	return strings.EqualFold(filepath.Ext(segment), node.Ext)
}

// classifyFile walks the FrameworkType structure tree to determine a file's role.
// relPath uses forward slashes.
func classifyFile(relPath string, structure map[string]database.StructNode) fileRole {
	parts := strings.SplitN(relPath, "/", 2)
	if node, ok := structure[parts[0]]; ok {
		return walkStructNode(node, parts[1:], fileRoleNone)
	}
	for pattern, node := range structure {
		if segmentMatches(pattern, parts[0]) {
			return walkStructNode(node, parts[1:], fileRoleNone)
		}
	}
	return fileRoleNone
}

// walkStructNode resolves a file's role. Entrypoint and split flags win
// immediately; otherwise the deepest role tag along the path applies.
func walkStructNode(node database.StructNode, remaining []string, inherited fileRole) fileRole {
	if node.Entrypoint {
		return fileRoleEntrypoint
	}
	if node.Split {
		return fileRoleData
	}
	role := roleFromTag(node.Role, inherited)
	if len(remaining) == 0 || remaining[0] == "" {
		return role
	}
	if node.Children != nil {
		parts := strings.SplitN(remaining[0], "/", 2)
		if child, ok := node.Children[parts[0]]; ok {
			return walkStructNode(child, parts[1:], role)
		}
		for pattern, child := range node.Children {
			if segmentMatches(pattern, parts[0]) {
				return walkStructNode(child, parts[1:], role)
			}
		}
	}
	return role
}

func getFrameworkFiles(cfg *hubconfig.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		fid := c.Param("id")
		framework, err := database.GetFrameworkByID(fid)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "framework not found"})
			return
		}

		var structure map[string]database.StructNode
		if framework.ToolType != "" {
			ft, ftErr := database.GetFrameworkTypeByName(framework.ToolType)
			if ftErr == nil && ft.Structure != "" && ft.Structure != "{}" {
				json.Unmarshal([]byte(ft.Structure), &structure) //nolint:errcheck
			}
		}

		baseDir := filepath.Join(cfg.ScriptsDir, "frameworks", fid)
		fileset := &FrameworkFileSet{
			Entrypoints: []string{},
			DataFiles:   []string{},
			Configs:     []string{},
			Plugins:     []string{},
			Util:        []string{},
		}

		walkErr := filepath.WalkDir(baseDir, func(p string, d fs.DirEntry, werr error) error {
			if werr != nil || d.IsDir() {
				return nil
			}
			rel, _ := filepath.Rel(baseDir, p)
			rel = filepath.ToSlash(rel)
			if structure != nil {
				switch classifyFile(rel, structure) {
				case fileRoleEntrypoint:
					fileset.Entrypoints = append(fileset.Entrypoints, rel)
				case fileRoleData:
					fileset.DataFiles = append(fileset.DataFiles, rel)
				case fileRolePlugin:
					fileset.Plugins = append(fileset.Plugins, rel)
				case fileRoleUtil:
					fileset.Util = append(fileset.Util, rel)
				case fileRoleConfig:
					fileset.Configs = append(fileset.Configs, rel)
				}
			} else {
				fileset.Configs = append(fileset.Configs, rel)
			}
			return nil
		})
		if walkErr != nil && !os.IsNotExist(walkErr) {
			slog.Error("Failed to walk framework files", "id", fid, "error", walkErr)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to scan framework files"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": fileset})
	}
}

// --- Framework Entry Validation ---

type validateEntryReq struct {
	EntryPoint string `json:"entryPoint"`
}

func validateFrameworkEntry(cfg *hubconfig.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		fid := c.Param("id")
		var req validateEntryReq
		if err := c.ShouldBindJSON(&req); err != nil || req.EntryPoint == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "entryPoint required"})
			return
		}

		// Prevent path traversal
		clean := filepath.Clean("/" + req.EntryPoint)
		if strings.Contains(clean, "..") {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid entryPoint path"})
			return
		}

		if _, err := database.GetFrameworkByID(fid); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "framework not found"})
			return
		}

		baseDir := filepath.Join(cfg.ScriptsDir, "frameworks", fid)
		entryPath := filepath.Join(baseDir, filepath.FromSlash(strings.TrimPrefix(clean, "/")))

		if _, err := os.Stat(entryPath); os.IsNotExist(err) {
			c.JSON(http.StatusOK, gin.H{
				"success": true, "valid": false,
				"error":     "entry point file not found",
				"csvParams": []string{}, "missingDeps": []string{}, "warnings": []string{},
			})
			return
		}

		// JMeter: parse JMX for required CSV property names
		if strings.ToLower(filepath.Ext(entryPath)) == ".jmx" {
			csvParams, err := jmeter.ParseRequiredCSVs(entryPath)
			if err != nil {
				slog.Error("Failed to parse JMX", "path", entryPath, "error", err)
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to parse entry point"})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"success": true, "valid": true,
				"csvParams":   csvParams,
				"missingDeps": []string{},
				"warnings":    []string{},
			})
			return
		}

		// Other file types: just confirm existence
		c.JSON(http.StatusOK, gin.H{
			"success": true, "valid": true,
			"csvParams": []string{}, "missingDeps": []string{}, "warnings": []string{},
		})
	}
}

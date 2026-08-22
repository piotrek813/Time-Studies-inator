package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	apiKey        = "MY_SECRET_API_KEY" // Replace with your secret key
	uploadDir     = "./upload"
	indexPath     = "./index.html"
	maxUploadSize = 150 << 20 // 150 MB limit
)

func main() {
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		log.Fatalf("Failed to create upload directory: %v", err)
	}

	http.HandleFunc("/", handleIndex)
	http.HandleFunc("/upload", handleUpload)

	log.Println("Server starting on http://localhost:8080...")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, indexPath)
}

func handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 1. API Key Authentication
	key := r.Header.Get("X-API-Key")
	if key == "" {
		key = r.URL.Query().Get("api_key")
	}
	if key != apiKey {
		http.Error(w, "Unauthorized: Invalid API Key", http.StatusUnauthorized)
		return
	}

	// 2. Read file upload (up to 150 MB)
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		http.Error(w, "File too large (max 150MB)", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Failed to retrieve file from form", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// 3. Validate file extension (must be .exe)
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".exe" {
		http.Error(w, "Forbidden: Only .exe files are allowed", http.StatusBadRequest)
		return
	}

	// 4. Remove all old files from the upload directory before saving the new one
	if err := clearUploadDir(); err != nil {
		http.Error(w, "Failed to clean old files", http.StatusInternalServerError)
		return
	}

	// 5. Save the new .exe file
	dstPath := filepath.Join(uploadDir, filepath.Base(header.Filename))
	dst, err := os.Create(dstPath)
	if err != nil {
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "Failed to write file contents", http.StatusInternalServerError)
		return
	}

	// 6. Update index.html version via Regex
	newVersion := time.Now().Format("2006.01.02-15:04:05")
	if err := updateIndexVersion(newVersion); err != nil {
		log.Printf("Warning: Failed to update index.html version: %v", err)
	}

	fmt.Fprintf(w, "Executable '%s' uploaded successfully. Version updated to %s", header.Filename, newVersion)
}

func clearUploadDir() error {
	entries, err := os.ReadDir(uploadDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if err := os.RemoveAll(filepath.Join(uploadDir, entry.Name())); err != nil {
			return err
		}
	}
	return nil
}

func updateIndexVersion(newVersion string) error {
	content, err := os.ReadFile(indexPath)
	if err != nil {
		return err
	}

	re := regexp.MustCompile(`(<span\s+id="version">)(.*?)(</span>)`)
	updated := re.ReplaceAll(content, []byte("${1}"+newVersion+"${3}"))

	return os.WriteFile(indexPath, updated, 0644)
}

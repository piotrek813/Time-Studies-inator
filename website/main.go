package main

import (
	"crypto/subtle"
	"fmt"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
)

const (
	uploadDir     = "./static/upload"
	maxUploadSize = 200 << 20
)

var authToken string

func main() {
	authToken = os.Getenv("API_KEY")
	if authToken == "" {
		log.Fatal("AKI_KEY environment variable must be set (used to authenticate uploads)")
	}

	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		log.Fatalf("failed to create upload dir: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.Dir("static")))
	mux.HandleFunc("/upload", handleUpload)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	addr := ":8080"
	log.Printf("listening on %s, replacing %s on each successful upload", addr, uploadDir)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func replaceVersion(path, newVersion string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	re := regexp.MustCompile(`v\d+\.\d+\.\d+`)
	updated := re.ReplaceAllString(string(data), "v"+newVersion)

	return os.WriteFile(path, []byte(updated), 0644)
}

func uploadFile(file multipart.File, header *multipart.FileHeader) error {
	if err := os.RemoveAll(uploadDir); err != nil {
		return err
	}

	if err := os.Mkdir(uploadDir, 0755); err != nil {
		return err
	}

	dst, err := os.Create(filepath.Join(uploadDir, header.Filename))

	if err != nil {
		return err
	}

	defer dst.Close()

	// Copy the uploaded file to the destination file
	if _, err := dst.ReadFrom(file); err != nil {
		return err
	}

	return nil
}

func handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// --- auth ---
	token := r.Header.Get("X-Upload-Token")
	if subtle.ConstantTimeCompare([]byte(token), []byte(authToken)) != 1 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// --- limit body size ---
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		http.Error(w, fmt.Sprintf("bad multipart form: %v", err), http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, fmt.Sprintf("missing file field: %v", err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// --- basic validation ---
	ext := filepath.Ext(header.Filename)
	if ext != ".exe" {
		http.Error(w, "only .exe files are accepted", http.StatusBadRequest)
		return
	}

	err = uploadFile(file, header)

	if err != nil {
		http.Error(w, "Error saving the file", http.StatusInternalServerError)
		return
	}

	version := r.FormValue("version")
	fmt.Print(version)
	replaceVersion("./static/index.html", version)

	w.WriteHeader(http.StatusOK)
}

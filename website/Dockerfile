# --- Stage 1: Build Stage ---
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy Go source files
COPY main.go .

# Build a static binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server main.go

# --- Stage 2: Final Runtime Stage ---
FROM alpine:latest

WORKDIR /app

# Copy the compiled binary from builder
COPY --from=builder /app/server .

# Copy initial index.html into workspace
COPY static .

# Create the upload directory
RUN mkdir -p /app/upload

# Expose port 8080
EXPOSE 8080

# Run binary
CMD ["./server"]

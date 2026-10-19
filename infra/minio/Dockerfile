# The security-fixed upstream release is source-only. Build that exact commit.
FROM golang:1.26-bookworm AS builder
WORKDIR /src
RUN git init . \
    && git remote add origin https://github.com/minio/minio.git \
    && git fetch --depth 1 origin 9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a \
    && git checkout --detach FETCH_HEAD
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/minio .

FROM alpine:3.23 AS server
RUN apk add --no-cache ca-certificates \
    && addgroup -g 10001 minio \
    && adduser -D -u 10001 -G minio minio \
    && mkdir /data && chown minio:minio /data
COPY --from=builder /out/minio /usr/local/bin/minio
USER minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]

# The upstream client image is not available anonymously; build the pinned client.
FROM builder AS client-builder
WORKDIR /client
RUN git init . \
    && git remote add origin https://github.com/minio/mc.git \
    && git fetch --depth 1 origin d6541ea280b73a834b64d4097e21f2be77676104 \
    && git checkout --detach FETCH_HEAD \
    && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/mc .

FROM alpine:3.23 AS client
RUN apk add --no-cache ca-certificates
COPY --from=client-builder /out/mc /usr/local/bin/mc
ENTRYPOINT ["mc"]

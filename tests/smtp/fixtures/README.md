These are public, disposable test credentials for the loopback SMTP fixture only.
Never use this key or certificate in a deployment. `server.crt` includes localhost
and 127.0.0.1; `expired.crt` deliberately expired in 2021. `dh1024.dh`
deliberately uses an insecure 1024-bit group to reproduce the handoff failure.

Generated with OpenSSL:

```sh
openssl req -x509 -newkey rsa:2048 -nodes -keyout server.key -out server.crt -days 36500 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
openssl x509 -in server.crt -signkey server.key -out expired.crt -not_before 20200101000000Z -not_after 20210101000000Z
openssl x509 -in server.crt -signkey server.key -out server.crt -not_before 20200101000000Z -not_after 21260101000000Z
openssl dhparam -out dh1024.dh 1024
```

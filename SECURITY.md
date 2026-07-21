# Security checklist

- Use a unique `JWT_SECRET` with at least 32 random characters.
- Change the initial admin password immediately.
- Set `WEB_ORIGIN` to the exact production domain.
- Run behind HTTPS and a reverse proxy.
- Do not expose PostgreSQL publicly.
- Back up the database and uploaded files.
- Keep dependencies updated and review payment webhooks carefully.
- The included upload endpoint accepts only common image MIME types and enforces a size limit, but production deployments should also use object storage and malware scanning when needed.

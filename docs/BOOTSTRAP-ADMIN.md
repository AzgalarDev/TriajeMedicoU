# Bootstrap administrator

Copy `backend/.env.example` to `backend/.env` and replace every `DEFAULT_ADMIN_*` placeholder with real values. The seed requires username, password, full name, date of birth, and national ID; sex defaults to `MALE` when omitted.

Run from the repository root:

```bash
npm run prisma:seed --workspace backend
```

The command validates inputs, hashes the password with bcrypt, and is idempotent by username. Re-running it does not create a duplicate or overwrite the existing administrator. It refuses to continue if the username already belongs to a non-administrator. Never commit `backend/.env` or real credentials.

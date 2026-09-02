# Deployment Quick Reference

## One-Time Setup

```bash
# 1. Install EAS CLI globally
npm install -g eas-cli

# 2. Login to Expo
eas login

# 3. Link project to Expo
eas init

# 4. Configure Apple credentials (first time only)
eas credentials
```

## Update Bundle Identifier

Edit `app.config.js`:

```javascript
ios: {
  bundleIdentifier: 'com.yourcompany.jarvisrecipes',
},
```

## Update API URLs

Edit `eas.json` to set your staging/production API URLs.

## GitHub Secrets Required

Add these in GitHub repo → Settings → Secrets:

```
EXPO_TOKEN          # From: https://expo.dev → Settings → Access Tokens
APPLE_ID            # Your Apple ID email
APPLE_TEAM_ID       # From: https://developer.apple.com/account → Membership
ASC_APP_ID          # From App Store Connect → App Information
AUTH_API_BASE_URL   # Production auth API
RECIPES_API_BASE_URL # Production recipes API
```

## Common Commands

### Local Development

```bash
# Start dev server
npm start

# iOS simulator
npm run dev:ios
```

### Build Commands

```bash
# Preview build (staging API, internal testing)
eas build --platform ios --profile preview

# Production build (production API, TestFlight)
eas build --platform ios --profile production
```

### Submit to TestFlight

```bash
# Submit latest production build
eas submit --platform ios --latest
```

### Check Build Status

```bash
# View all builds
eas build:list

# View specific build
eas build:view [BUILD_ID]
```

## Automated via GitHub Actions

- PR into `main` → Type check + Jest only (no build)
- Push to `main` → Builds preview + submits to TestFlight
- Push of a `v*` tag → Builds production + submits to TestFlight
- Manual trigger → Actions tab → "Run workflow"

## Typical Workflow

1. **Develop locally** with `npm start`
2. **Open a PR into main** → type check + Jest run as required gates
3. **Merge to main** → Auto-builds preview and submits to TestFlight
4. **Tag `vX.Y.Z` and push** → Auto-builds production and submits to TestFlight
5. **TestFlight testing** with internal/external testers
6. **Submit to App Store** when ready (manual in App Store Connect)

## Environment Variables

### Development (.env)

```bash
EXPO_PUBLIC_AUTH_API_BASE_URL=http://localhost:7701
EXPO_PUBLIC_RECIPES_API_BASE_URL=http://localhost:7030
```

### Staging (eas.json - preview profile)

```json
{
  "EXPO_PUBLIC_AUTH_API_BASE_URL": "https://auth-staging.example.com",
  "EXPO_PUBLIC_RECIPES_API_BASE_URL": "https://recipes-staging.example.com"
}
```

### Production (eas.json - production profile)

```json
{
  "EXPO_PUBLIC_AUTH_API_BASE_URL": "https://auth.example.com",
  "EXPO_PUBLIC_RECIPES_API_BASE_URL": "https://recipes.example.com"
}
```

## Troubleshooting

**Build fails?**
```bash
eas build:list  # Check error logs
```

**Credentials issue?**
```bash
eas credentials  # Reconfigure
```

**Not in TestFlight after 30 min?**
- Check App Store Connect → TestFlight → Builds
- Verify ASC_APP_ID matches your app
- Check processing status

## Resources

- Full deployment guide: [DEPLOYMENT.md](./DEPLOYMENT.md)
- EAS Docs: https://docs.expo.dev/build/introduction/
- Expo Dashboard: https://expo.dev
- App Store Connect: https://appstoreconnect.apple.com


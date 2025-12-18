# Deployment Guide: TestFlight via GitHub Actions

This guide covers how to build and deploy the Jarvis Recipes mobile app to TestFlight using EAS Build and GitHub Actions.

## Overview

We use **Expo Application Services (EAS)** for building and submitting the iOS app. The process is automated via GitHub Actions and supports multiple build profiles:

- **development**: Local development with dev client
- **preview**: Internal testing builds (staging API)
- **production**: App Store/TestFlight releases (production API)

## Prerequisites

### 1. Install EAS CLI

```bash
npm install -g eas-cli
```

### 2. Expo Account

- Create an Expo account at https://expo.dev
- Log in: `eas login`

### 3. Apple Developer Account

- Enrolled in Apple Developer Program ($99/year)
- Access to App Store Connect
- Note your:
  - Apple ID (email)
  - Team ID
  - App Store Connect App ID (created after first submission)

## Initial Setup

### Step 1: Configure App Identifier

Update `app.config.js` with your bundle identifier:

```javascript
ios: {
  bundleIdentifier: 'com.yourcompany.jarvisrecipes', // Update this!
},
```

### Step 2: Configure EAS Project

Initialize EAS (if not already done):

```bash
eas init
```

This links your local project to an Expo project.

### Step 3: Update Build URLs in eas.json

Edit `eas.json` and update the API URLs for your environments:

```json
{
  "build": {
    "preview": {
      "env": {
        "EXPO_PUBLIC_AUTH_API_BASE_URL": "https://your-staging-auth-api.com",
        "EXPO_PUBLIC_RECIPES_API_BASE_URL": "https://your-staging-recipes-api.com"
      }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_AUTH_API_BASE_URL": "https://your-production-auth-api.com",
        "EXPO_PUBLIC_RECIPES_API_BASE_URL": "https://your-production-recipes-api.com"
      }
    }
  }
}
```

### Step 4: Create App in App Store Connect

1. Go to https://appstoreconnect.apple.com
2. Click "My Apps" → "+" → "New App"
3. Fill in:
   - Platform: iOS
   - Name: Jarvis Recipes
   - Primary Language: English
   - Bundle ID: (select the one you configured)
   - SKU: jarvis-recipes-mobile
4. Note the **App ID** (numeric, found in App Information)

### Step 5: Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:

| Secret Name | Description | Example |
|------------|-------------|---------|
| `EXPO_TOKEN` | Expo access token | Get from `eas whoami` or expo.dev |
| `APPLE_ID` | Your Apple ID email | developer@example.com |
| `APPLE_TEAM_ID` | Apple Team ID | ABC123DEF4 |
| `ASC_APP_ID` | App Store Connect App ID | 1234567890 |
| `AUTH_API_BASE_URL` | Production auth API URL | https://auth.jarvisrecipes.com |
| `RECIPES_API_BASE_URL` | Production recipes API URL | https://recipes.jarvisrecipes.com |

#### How to get EXPO_TOKEN:

```bash
eas whoami
# Then get token from: https://expo.dev/accounts/[username]/settings/access-tokens
# Create a new token with name "GitHub Actions"
```

#### How to get APPLE_TEAM_ID:

```bash
# After configuring credentials with EAS:
eas credentials

# Or find it at: https://developer.apple.com/account → Membership
```

## Building Locally (Optional)

### Preview Build

```bash
# Build for internal distribution (Ad Hoc)
eas build --platform ios --profile preview
```

### Production Build

```bash
# Build for App Store/TestFlight
eas build --platform ios --profile production
```

### Submit to TestFlight (Manual)

```bash
eas submit --platform ios --profile production --latest
```

## Automated Deployment via GitHub Actions

### Automatic Triggers

The GitHub Action runs automatically on:

- **Push to `main` branch**: Builds and submits production build to TestFlight
- **Push to `staging` branch**: Builds preview build (internal testing)

### Manual Trigger

You can also trigger builds manually:

1. Go to your GitHub repo → Actions tab
2. Select "Build and Deploy to TestFlight" workflow
3. Click "Run workflow"
4. Select profile (preview or production)
5. Click "Run workflow"

## Build Profiles Explained

### development

- **Purpose**: Local development with Expo Dev Client
- **Distribution**: Internal (development team only)
- **APIs**: localhost (dev servers)
- **Use case**: Testing native code changes

### preview

- **Purpose**: Internal testing with staging APIs
- **Distribution**: Internal (Ad Hoc)
- **APIs**: Staging environment
- **Use case**: QA testing before production

### production

- **Purpose**: App Store and TestFlight releases
- **Distribution**: App Store
- **APIs**: Production environment
- **Auto-increment**: Version bumped automatically
- **Submits to**: TestFlight (then App Store when ready)

## Environment Variables

### Local Development

Create a `.env` file:

```bash
EXPO_PUBLIC_AUTH_API_BASE_URL=http://localhost:8007
EXPO_PUBLIC_RECIPES_API_BASE_URL=http://localhost:8001
```

### EAS Builds

Environment variables are defined in `eas.json` per profile. These can be overridden via GitHub secrets for sensitive values.

## Workflow

### Typical Release Process

1. **Development**: Work on feature branches, test locally
2. **Staging**: Merge to `staging` → Auto-builds preview → Test with staging API
3. **Production**: Merge to `main` → Auto-builds and submits to TestFlight
4. **TestFlight**: Distribute to internal/external testers
5. **App Store**: When ready, submit from App Store Connect

## Troubleshooting

### Build fails with "EXPO_TOKEN not found"

Make sure you've added the `EXPO_TOKEN` secret in GitHub repository settings.

### "No bundle identifier configured"

Update `ios.bundleIdentifier` in `app.config.js`.

### "Apple credentials required"

On first build, EAS will prompt for Apple credentials. You can configure them ahead of time:

```bash
eas credentials
```

### "Provisioning profile doesn't match"

EAS manages certificates and provisioning profiles automatically. If you see this error:

```bash
eas credentials --platform ios
# Select "Set up new credentials"
```

### Build succeeds but doesn't appear in TestFlight

- Check that `ASC_APP_ID` matches your app in App Store Connect
- Verify your Apple ID has access to the app
- Processing can take 10-30 minutes after submission

## Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [GitHub Actions with EAS](https://docs.expo.dev/build/building-on-ci/)
- [App Store Connect](https://appstoreconnect.apple.com)

## Support

For issues specific to:
- EAS: https://expo.dev/support
- App Store: https://developer.apple.com/support/
- This project: Contact your team lead


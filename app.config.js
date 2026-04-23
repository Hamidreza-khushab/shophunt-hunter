const fs = require("fs");
const path = require("path");

function stripOptionalQuotes(value) {
  const trimmedValue = value.trim();
  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }
  return trimmedValue;
}

function getEnvValue(name) {
  if (process.env[name]) {
    return process.env[name];
  }

  try {
    const envPath = path.join(__dirname, ".env");
    const envText = fs.readFileSync(envPath, "utf8");
    let envValue;

    for (const line of envText.split(/\r?\n/)) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const prefix = `${name}=`;
      if (trimmedLine.startsWith(prefix)) {
        const value = stripOptionalQuotes(trimmedLine.slice(prefix.length));
        if (value) {
          envValue = value;
        }
      }
    }

    return envValue;
  } catch {
    return undefined;
  }
}

module.exports = ({ config }) => {
  const googleMapsApiKey = getEnvValue("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY");
  const androidConfig = {
    ...(config.android?.config || {}),
  };

  if (googleMapsApiKey) {
    androidConfig.googleMaps = {
      ...(androidConfig.googleMaps || {}),
      apiKey: googleMapsApiKey,
    };
  }

  return {
    ...config,
    android: {
      ...config.android,
      config:
        Object.keys(androidConfig).length > 0
          ? androidConfig
          : config.android?.config,
      permissions: Array.from(
        new Set([
          ...(config.android?.permissions || []),
          "ACCESS_COARSE_LOCATION",
          "ACCESS_FINE_LOCATION",
        ])
      ),
    },
  };
};

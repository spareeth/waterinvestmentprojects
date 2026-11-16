// Public, non-secret settings. The platform name is not agreed yet ("Blue Pipeline" is a placeholder),
// so it must only ever be read from here, never hard-coded in components.

export const appConfig = {
  name: process.env.APP_NAME || "Blue Pipeline",
  tagline: "Water Investment Summit Project Portal",
  url: process.env.APP_URL || "http://localhost:3000",
  supportEmail: process.env.SUPPORT_EMAIL || undefined,
  developedBy: "Developed by Expo City Dubai, through Terra",
} as const;

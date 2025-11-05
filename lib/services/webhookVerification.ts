const HEADER_CHANNEL_ID = 'x-goog-channel-id';
const HEADER_CHANNEL_TOKEN = 'x-goog-channel-token';
const HEADER_MESSAGE_NUMBER = 'x-goog-message-number';
const HEADER_RESOURCE_ID = 'x-goog-resource-id';
const HEADER_RESOURCE_STATE = 'x-goog-resource-state';
const HEADER_RESOURCE_URI = 'x-goog-resource-uri';
const HEADER_MESSAGE_TYPE = 'x-goog-message-type';
const HEADER_CHANNEL_EXPIRATION = 'x-goog-channel-expiration';

export type DriveWebhookHeaders = {
  channelId: string | null;
  channelToken: string | null;
  messageNumber: string | null;
  resourceId: string | null;
  resourceState: string | null;
  resourceUri: string | null;
  messageType: string | null;
  channelExpiration: string | null;
};

export function getDriveWebhookHeaders(headers: Headers): DriveWebhookHeaders {
  return {
    channelId: headers.get(HEADER_CHANNEL_ID),
    channelToken: headers.get(HEADER_CHANNEL_TOKEN),
    messageNumber: headers.get(HEADER_MESSAGE_NUMBER),
    resourceId: headers.get(HEADER_RESOURCE_ID),
    resourceState: headers.get(HEADER_RESOURCE_STATE),
    resourceUri: headers.get(HEADER_RESOURCE_URI),
    messageType: headers.get(HEADER_MESSAGE_TYPE),
    channelExpiration: headers.get(HEADER_CHANNEL_EXPIRATION),
  };
}

export function requireChannelToken(headers: Headers): string {
  const token = headers.get(HEADER_CHANNEL_TOKEN);
  if (!token) {
    throw new Error('Missing X-Goog-Channel-Token header');
  }
  return token;
}

export function verifyChannelToken(headers: Headers, expectedToken: string): string {
  const token = requireChannelToken(headers);
  if (token !== expectedToken) {
    throw new Error('Invalid webhook channel token');
  }
  return token;
}

export function extractFileIdFromHeaders(headers: Headers): string | null {
  const resourceUri = headers.get(HEADER_RESOURCE_URI);

  if (resourceUri) {
    const uriMatch = resourceUri.match(/\/files\/([^/?]+)/);
    if (uriMatch && uriMatch[1]) {
      return decodeURIComponent(uriMatch[1]);
    }

    try {
      const parsed = new URL(resourceUri);
      const pathMatch = parsed.pathname.match(/\/files\/([^/]+)/);
      if (pathMatch && pathMatch[1]) {
        return decodeURIComponent(pathMatch[1]);
      }
    } catch {
      // Ignore invalid URL and fall back to resource ID header
    }
  }

  const resourceId = headers.get(HEADER_RESOURCE_ID);
  return resourceId ?? null;
}

export function getDriveWebhookDebugPayload(headers: Headers) {
  const snapshot = getDriveWebhookHeaders(headers);
  return {
    ...snapshot,
    hasChannelToken: Boolean(snapshot.channelToken),
  };
}

export const DRIVE_WEBHOOK_HEADERS = {
  CHANNEL_ID: HEADER_CHANNEL_ID,
  CHANNEL_TOKEN: HEADER_CHANNEL_TOKEN,
  RESOURCE_ID: HEADER_RESOURCE_ID,
  RESOURCE_STATE: HEADER_RESOURCE_STATE,
  RESOURCE_URI: HEADER_RESOURCE_URI,
  MESSAGE_NUMBER: HEADER_MESSAGE_NUMBER,
  MESSAGE_TYPE: HEADER_MESSAGE_TYPE,
  CHANNEL_EXPIRATION: HEADER_CHANNEL_EXPIRATION,
} as const;

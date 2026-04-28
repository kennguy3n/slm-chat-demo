export type ContextMode = 'b2c' | 'b2b';

export type ChannelKind = 'dm' | 'family' | 'community' | 'channel';

export interface User {
  id: string;
  displayName: string;
  email: string;
  avatarColor: string;
}

export interface Domain {
  id: string;
  name: string;
}

export interface Workspace {
  id: string;
  name: string;
  context: ContextMode;
  domains: Domain[];
}

export interface Channel {
  id: string;
  workspaceId: string;
  domainId?: string;
  name: string;
  kind: ChannelKind;
  context: ContextMode;
  memberIds: string[];
}

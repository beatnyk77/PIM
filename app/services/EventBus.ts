import mitt from 'mitt';

export type AppEvents = {
  // Messaging Events
  'message.received': any; // Raw message data
  'message.secure-received': { from: string, content: string, timestamp: number, messageId?: string, type?: string, mediaUri?: string };
  'message.group-received': { from: string, groupId: string, content: string, timestamp: number, type?: string, mediaUri?: string };
  'message.read-receipt': { messageId: string; from: string };
  'group.security_update': { groupId: string; message: string };
  
  // Connection Events
  'network.connected': void;
  'network.disconnected': void;
  
  // AI Events
  'ai.suggestion': { chatId: string, suggestion: string };
  'ai.task-detected': { chatId: string, task: string, originalContent: string };
};

export const EventBus = mitt<AppEvents>();

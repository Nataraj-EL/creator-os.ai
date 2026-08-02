import { AgentMessage } from './types';

export class MessageBus {
  private subscribers: Map<string, Set<(message: AgentMessage) => void>> = new Map();
  private messages: AgentMessage[] = [];

  public subscribe(
    agentId: string,
    callback: (message: AgentMessage) => void
  ): () => void {
    let agentSubs = this.subscribers.get(agentId);
    if (!agentSubs) {
      agentSubs = new Set();
      this.subscribers.set(agentId, agentSubs);
    }
    agentSubs.add(callback);

    return () => {
      const subs = this.subscribers.get(agentId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(agentId);
        }
      }
    };
  }

  public publish(message: AgentMessage): void {
    // Freeze message to ensure immutability
    const frozenMessage = Object.freeze({
      ...message,
      content: typeof message.content === 'object' ? Object.freeze({ ...message.content }) : message.content
    });

    this.messages.push(frozenMessage);

    // Route to subscribers of the recipient
    const recipientSubs = this.subscribers.get(frozenMessage.recipientId);
    if (recipientSubs) {
      for (const callback of recipientSubs) {
        try {
          callback(frozenMessage);
        } catch (err) {
          console.error(`[MessageBus] Subscriber failed for agent "${frozenMessage.recipientId}":`, err);
        }
      }
    }

    // Also route to wildcard subscribers (broadcasts / coordinator) if any
    const wildcardSubs = this.subscribers.get('*');
    if (wildcardSubs) {
      for (const callback of wildcardSubs) {
        try {
          callback(frozenMessage);
        } catch (err) {
          console.error('[MessageBus] Wildcard subscriber failed:', err);
        }
      }
    }
  }

  public getHistory(traceId: string): AgentMessage[] {
    return this.messages.filter(m => m.traceId === traceId);
  }

  public clear(): void {
    this.messages = [];
    this.subscribers.clear();
  }
}

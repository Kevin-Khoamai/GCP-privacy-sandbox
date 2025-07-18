/**
 * Event Bus - Central event system for component communication
 * Provides decoupled communication between system components
 */
export class EventBus {
  private static instance: EventBus;
  private listeners: Map<string, EventListener[]> = new Map();
  private eventHistory: EventHistoryEntry[] = [];
  private maxHistorySize: number = 1000;
  private isDebugMode: boolean = false;

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to an event
   */
  public on(eventName: string, callback: EventCallback): EventListener {
    const listener: EventListener = {
      id: this.generateListenerId(),
      eventName,
      callback,
      once: false,
      priority: 0,
      createdAt: new Date()
    };

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }

    this.listeners.get(eventName)!.push(listener);
    this.sortListenersByPriority(eventName);

    if (this.isDebugMode) {
      console.log(`EventBus: Registered listener for '${eventName}'`, listener.id);
    }

    return listener;
  }

  /**
   * Subscribe to an event (one-time only)
   */
  public once(eventName: string, callback: EventCallback): EventListener {
    const listener = this.on(eventName, callback);
    listener.once = true;
    return listener;
  }

  /**
   * Subscribe to an event with priority
   */
  public onWithPriority(eventName: string, callback: EventCallback, priority: number = 0): EventListener {
    const listener = this.on(eventName, callback);
    listener.priority = priority;
    this.sortListenersByPriority(eventName);
    return listener;
  }

  /**
   * Unsubscribe from an event
   */
  public off(eventName: string, listenerOrCallback?: EventListener | EventCallback): void {
    const listeners = this.listeners.get(eventName);
    if (!listeners) return;

    if (!listenerOrCallback) {
      // Remove all listeners for this event
      this.listeners.delete(eventName);
      if (this.isDebugMode) {
        console.log(`EventBus: Removed all listeners for '${eventName}'`);
      }
      return;
    }

    let indexToRemove = -1;

    if (typeof listenerOrCallback === 'function') {
      // Remove by callback function
      indexToRemove = listeners.findIndex(listener => listener.callback === listenerOrCallback);
    } else {
      // Remove by listener object
      indexToRemove = listeners.findIndex(listener => listener.id === listenerOrCallback.id);
    }

    if (indexToRemove > -1) {
      const removedListener = listeners.splice(indexToRemove, 1)[0];
      if (this.isDebugMode) {
        console.log(`EventBus: Removed listener for '${eventName}'`, removedListener.id);
      }
    }

    // Clean up empty event arrays
    if (listeners.length === 0) {
      this.listeners.delete(eventName);
    }
  }

  /**
   * Emit an event
   */
  public emit(eventName: string, data?: any): Promise<void> {
    return this.emitAsync(eventName, data);
  }

  /**
   * Emit an event synchronously
   */
  public emitSync(eventName: string, data?: any): void {
    const listeners = this.listeners.get(eventName);
    if (!listeners || listeners.length === 0) {
      if (this.isDebugMode) {
        console.log(`EventBus: No listeners for '${eventName}'`);
      }
      return;
    }

    const event: EventData = {
      name: eventName,
      data,
      timestamp: new Date(),
      id: this.generateEventId()
    };

    // Add to history
    this.addToHistory(event);

    if (this.isDebugMode) {
      console.log(`EventBus: Emitting '${eventName}'`, data);
    }

    // Execute listeners synchronously
    const listenersToRemove: EventListener[] = [];

    for (const listener of listeners) {
      try {
        listener.callback(data, event);

        // Mark one-time listeners for removal
        if (listener.once) {
          listenersToRemove.push(listener);
        }
      } catch (error) {
        console.error(`EventBus: Error in listener for '${eventName}':`, error);
        
        // Emit error event (but avoid infinite loops)
        if (eventName !== 'eventbus:error') {
          this.emitSync('eventbus:error', {
            originalEvent: eventName,
            listener: listener.id,
            error
          });
        }
      }
    }

    // Remove one-time listeners
    this.removeListeners(eventName, listenersToRemove);
  }

  /**
   * Emit an event asynchronously
   */
  public async emitAsync(eventName: string, data?: any): Promise<void> {
    const listeners = this.listeners.get(eventName);
    if (!listeners || listeners.length === 0) {
      if (this.isDebugMode) {
        console.log(`EventBus: No listeners for '${eventName}'`);
      }
      return;
    }

    const event: EventData = {
      name: eventName,
      data,
      timestamp: new Date(),
      id: this.generateEventId()
    };

    // Add to history
    this.addToHistory(event);

    if (this.isDebugMode) {
      console.log(`EventBus: Emitting async '${eventName}'`, data);
    }

    // Execute listeners asynchronously
    const listenersToRemove: EventListener[] = [];
    const promises: Promise<void>[] = [];

    for (const listener of listeners) {
      const promise = this.executeListenerAsync(listener, data, event)
        .then(() => {
          if (listener.once) {
            listenersToRemove.push(listener);
          }
        })
        .catch(error => {
          console.error(`EventBus: Error in async listener for '${eventName}':`, error);
          
          // Emit error event (but avoid infinite loops)
          if (eventName !== 'eventbus:error') {
            this.emitSync('eventbus:error', {
              originalEvent: eventName,
              listener: listener.id,
              error
            });
          }
        });

      promises.push(promise);
    }

    // Wait for all listeners to complete
    await Promise.all(promises);

    // Remove one-time listeners
    this.removeListeners(eventName, listenersToRemove);
  }

  /**
   * Emit an event and wait for all listeners to complete with results
   */
  public async emitWithResults<T = any>(eventName: string, data?: any): Promise<T[]> {
    const listeners = this.listeners.get(eventName);
    if (!listeners || listeners.length === 0) {
      return [];
    }

    const event: EventData = {
      name: eventName,
      data,
      timestamp: new Date(),
      id: this.generateEventId()
    };

    // Add to history
    this.addToHistory(event);

    if (this.isDebugMode) {
      console.log(`EventBus: Emitting with results '${eventName}'`, data);
    }

    // Execute listeners and collect results
    const results: T[] = [];
    const listenersToRemove: EventListener[] = [];

    for (const listener of listeners) {
      try {
        const result = await this.executeListenerAsync(listener, data, event);
        if (result !== undefined) {
          results.push(result);
        }

        if (listener.once) {
          listenersToRemove.push(listener);
        }
      } catch (error) {
        console.error(`EventBus: Error in listener for '${eventName}':`, error);
        
        // Still emit error event
        if (eventName !== 'eventbus:error') {
          this.emitSync('eventbus:error', {
            originalEvent: eventName,
            listener: listener.id,
            error
          });
        }
      }
    }

    // Remove one-time listeners
    this.removeListeners(eventName, listenersToRemove);

    return results;
  }

  /**
   * Check if there are any listeners for an event
   */
  public hasListeners(eventName: string): boolean {
    const listeners = this.listeners.get(eventName);
    return listeners ? listeners.length > 0 : false;
  }

  /**
   * Get the number of listeners for an event
   */
  public getListenerCount(eventName: string): number {
    const listeners = this.listeners.get(eventName);
    return listeners ? listeners.length : 0;
  }

  /**
   * Get all event names that have listeners
   */
  public getEventNames(): string[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * Get event history
   */
  public getEventHistory(limit?: number): EventHistoryEntry[] {
    const history = [...this.eventHistory];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Clear event history
   */
  public clearEventHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Enable or disable debug mode
   */
  public setDebugMode(enabled: boolean): void {
    this.isDebugMode = enabled;
    console.log(`EventBus: Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get system statistics
   */
  public getStats(): EventBusStats {
    const eventCounts = new Map<string, number>();
    
    for (const entry of this.eventHistory) {
      const count = eventCounts.get(entry.event.name) || 0;
      eventCounts.set(entry.event.name, count + 1);
    }

    return {
      totalListeners: Array.from(this.listeners.values()).reduce((sum, listeners) => sum + listeners.length, 0),
      totalEvents: Array.from(this.listeners.keys()).length,
      historySize: this.eventHistory.length,
      mostFrequentEvents: Array.from(eventCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }))
    };
  }

  /**
   * Remove all listeners and clear history
   */
  public reset(): void {
    this.listeners.clear();
    this.eventHistory = [];
    console.log('EventBus: Reset completed');
  }

  // Private helper methods
  private executeListenerAsync(listener: EventListener, data: any, event: EventData): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        const result = listener.callback(data, event);
        
        // Handle promises
        if (result && typeof result.then === 'function') {
          result.then(resolve).catch(reject);
        } else {
          resolve(result);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private sortListenersByPriority(eventName: string): void {
    const listeners = this.listeners.get(eventName);
    if (listeners) {
      listeners.sort((a, b) => b.priority - a.priority);
    }
  }

  private removeListeners(eventName: string, listenersToRemove: EventListener[]): void {
    if (listenersToRemove.length === 0) return;

    const listeners = this.listeners.get(eventName);
    if (!listeners) return;

    for (const listenerToRemove of listenersToRemove) {
      const index = listeners.findIndex(l => l.id === listenerToRemove.id);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }

    // Clean up empty event arrays
    if (listeners.length === 0) {
      this.listeners.delete(eventName);
    }
  }

  private addToHistory(event: EventData): void {
    const historyEntry: EventHistoryEntry = {
      event,
      listenerCount: this.getListenerCount(event.name)
    };

    this.eventHistory.push(historyEntry);

    // Maintain history size limit
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  private generateListenerId(): string {
    return `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Utility methods for common event patterns
  public createNamespace(namespace: string): NamespacedEventBus {
    return new NamespacedEventBus(this, namespace);
  }

  public waitFor(eventName: string, timeout?: number): Promise<any> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | null = null;
      
      const listener = this.once(eventName, (data) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(data);
      });

      if (timeout) {
        timeoutId = setTimeout(() => {
          this.off(eventName, listener);
          reject(new Error(`Timeout waiting for event '${eventName}'`));
        }, timeout);
      }
    });
  }
}

/**
 * Namespaced Event Bus for component-specific events
 */
export class NamespacedEventBus {
  constructor(
    private eventBus: EventBus,
    private namespace: string
  ) {}

  private getNamespacedEvent(eventName: string): string {
    return `${this.namespace}:${eventName}`;
  }

  public on(eventName: string, callback: EventCallback): EventListener {
    return this.eventBus.on(this.getNamespacedEvent(eventName), callback);
  }

  public once(eventName: string, callback: EventCallback): EventListener {
    return this.eventBus.once(this.getNamespacedEvent(eventName), callback);
  }

  public off(eventName: string, listenerOrCallback?: EventListener | EventCallback): void {
    this.eventBus.off(this.getNamespacedEvent(eventName), listenerOrCallback);
  }

  public emit(eventName: string, data?: any): Promise<void> {
    return this.eventBus.emit(this.getNamespacedEvent(eventName), data);
  }

  public emitSync(eventName: string, data?: any): void {
    this.eventBus.emitSync(this.getNamespacedEvent(eventName), data);
  }

  public hasListeners(eventName: string): boolean {
    return this.eventBus.hasListeners(this.getNamespacedEvent(eventName));
  }
}

// Type definitions
export type EventCallback = (data?: any, event?: EventData) => any;

export interface EventListener {
  id: string;
  eventName: string;
  callback: EventCallback;
  once: boolean;
  priority: number;
  createdAt: Date;
}

export interface EventData {
  name: string;
  data?: any;
  timestamp: Date;
  id: string;
}

export interface EventHistoryEntry {
  event: EventData;
  listenerCount: number;
}

export interface EventBusStats {
  totalListeners: number;
  totalEvents: number;
  historySize: number;
  mostFrequentEvents: Array<{ name: string; count: number }>;
}

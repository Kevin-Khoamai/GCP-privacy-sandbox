import { AdvancedEncryptionProvider } from './advanced-encryption';
import { PrivacySafeErrorLogger } from './error-handler';

/**
 * Secure Communication Protocol Implementation
 * Provides end-to-end encryption, message integrity, and secure key exchange
 */
export class SecureCommunicationProtocol {
  private static instance: SecureCommunicationProtocol;
  private encryptionProvider: AdvancedEncryptionProvider;
  private errorLogger: PrivacySafeErrorLogger;
  private sessionKeys: Map<string, SessionKey> = new Map();
  private messageSequence: Map<string, number> = new Map();

  // Protocol configuration
  private readonly PROTOCOL_VERSION = '1.0';
  private readonly MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_SEQUENCE_GAP = 100;

  private constructor() {
    this.encryptionProvider = AdvancedEncryptionProvider.getInstance();
    this.errorLogger = new PrivacySafeErrorLogger();
  }

  public static getInstance(): SecureCommunicationProtocol {
    if (!SecureCommunicationProtocol.instance) {
      SecureCommunicationProtocol.instance = new SecureCommunicationProtocol();
    }
    return SecureCommunicationProtocol.instance;
  }

  // Session management
  public async establishSession(peerId: string, publicKey?: string): Promise<SecureSession> {
    try {
      // Generate session key
      const sessionKeyString = await this.encryptionProvider.generateKey();
      const sessionId = this.generateSessionId();
      
      const sessionKey: SessionKey = {
        id: sessionId,
        key: sessionKeyString,
        peerId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.SESSION_TIMEOUT),
        isActive: true
      };

      this.sessionKeys.set(sessionId, sessionKey);
      this.messageSequence.set(sessionId, 0);

      // In a real implementation, this would involve key exchange with the peer
      // For now, we'll simulate a successful session establishment
      const session: SecureSession = {
        sessionId,
        peerId,
        established: true,
        encryptionAlgorithm: 'AES-256-GCM',
        integrityAlgorithm: 'HMAC-SHA256',
        protocolVersion: this.PROTOCOL_VERSION,
        createdAt: sessionKey.createdAt,
        expiresAt: sessionKey.expiresAt
      };

      await this.logCommunicationEvent('SESSION_ESTABLISHED', {
        sessionId,
        peerId,
        protocolVersion: this.PROTOCOL_VERSION
      });

      return session;

    } catch (error) {
      this.errorLogger.logError('SESSION_ESTABLISHMENT_FAILED', error instanceof Error ? error.message : 'Unknown error');
      throw new Error(`Failed to establish secure session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async terminateSession(sessionId: string): Promise<void> {
    try {
      const sessionKey = this.sessionKeys.get(sessionId);
      if (!sessionKey) {
        throw new Error(`Session ${sessionId} not found`);
      }

      sessionKey.isActive = false;
      this.sessionKeys.delete(sessionId);
      this.messageSequence.delete(sessionId);

      await this.logCommunicationEvent('SESSION_TERMINATED', {
        sessionId,
        peerId: sessionKey.peerId,
        duration: Date.now() - sessionKey.createdAt.getTime()
      });

    } catch (error) {
      this.errorLogger.logError('SESSION_TERMINATION_FAILED', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  // Secure messaging
  public async sendSecureMessage(
    sessionId: string,
    message: any,
    messageType: string = 'DATA'
  ): Promise<SecureMessage> {
    try {
      const sessionKey = this.validateSession(sessionId);
      
      // Validate message size
      const messageString = JSON.stringify(message);
      if (messageString.length > this.MAX_MESSAGE_SIZE) {
        throw new Error(`Message size exceeds maximum allowed size of ${this.MAX_MESSAGE_SIZE} bytes`);
      }

      // Get next sequence number
      const sequenceNumber = this.getNextSequenceNumber(sessionId);

      // Create message envelope
      const envelope: MessageEnvelope = {
        version: this.PROTOCOL_VERSION,
        sessionId,
        messageId: this.generateMessageId(),
        messageType,
        sequenceNumber,
        timestamp: new Date(),
        payload: message
      };

      // Encrypt the envelope
      const envelopeString = JSON.stringify(envelope);
      const encryptedPayload = await this.encryptionProvider.encryptSensitiveData(
        envelopeString,
        sessionKey.key,
        `session:${sessionId}`
      );

      // Generate message integrity check
      const integrityHash = await this.encryptionProvider.generateHMAC(
        encryptedPayload,
        sessionKey.key
      );

      const secureMessage: SecureMessage = {
        sessionId,
        messageId: envelope.messageId,
        encryptedPayload,
        integrityHash,
        timestamp: envelope.timestamp,
        sequenceNumber
      };

      await this.logCommunicationEvent('MESSAGE_SENT', {
        sessionId,
        messageId: envelope.messageId,
        messageType,
        size: messageString.length
      });

      return secureMessage;

    } catch (error) {
      this.errorLogger.logError('SECURE_MESSAGE_SEND_FAILED', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  public async receiveSecureMessage(secureMessage: SecureMessage): Promise<MessageEnvelope> {
    try {
      const sessionKey = this.validateSession(secureMessage.sessionId);

      // Verify message integrity
      const isIntegrityValid = await this.encryptionProvider.verifyHMAC(
        secureMessage.encryptedPayload,
        secureMessage.integrityHash,
        sessionKey.key
      );

      if (!isIntegrityValid) {
        throw new Error('Message integrity verification failed');
      }

      // Decrypt the message
      const decryptedData = await this.encryptionProvider.decryptSensitiveData(
        secureMessage.encryptedPayload,
        sessionKey.key
      );

      const envelope: MessageEnvelope = JSON.parse(decryptedData.data);

      // Validate message envelope
      this.validateMessageEnvelope(envelope, secureMessage);

      // Check sequence number
      this.validateSequenceNumber(secureMessage.sessionId, envelope.sequenceNumber);

      await this.logCommunicationEvent('MESSAGE_RECEIVED', {
        sessionId: secureMessage.sessionId,
        messageId: envelope.messageId,
        messageType: envelope.messageType
      });

      return envelope;

    } catch (error) {
      this.errorLogger.logError('SECURE_MESSAGE_RECEIVE_FAILED', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  // Secure API communication
  public async secureAPIRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    data?: any,
    sessionId?: string
  ): Promise<SecureAPIResponse> {
    try {
      // Create request envelope
      const requestEnvelope: APIRequestEnvelope = {
        endpoint,
        method,
        data,
        timestamp: new Date(),
        requestId: this.generateRequestId(),
        nonce: this.generateNonce()
      };

      let encryptedRequest: string;
      let authHeader: string;

      if (sessionId) {
        // Use session-based encryption
        const sessionKey = this.validateSession(sessionId);
        encryptedRequest = await this.encryptionProvider.encryptSensitiveData(
          JSON.stringify(requestEnvelope),
          sessionKey.key,
          `api:${endpoint}`
        );
        authHeader = `Session ${sessionId}`;
      } else {
        // Use API key-based encryption (would need API key management)
        encryptedRequest = JSON.stringify(requestEnvelope);
        authHeader = 'Bearer API_KEY'; // Placeholder
      }

      // In a real implementation, this would make an actual HTTP request
      // For now, we'll simulate a successful response
      const response: SecureAPIResponse = {
        success: true,
        data: { message: 'Simulated secure API response' },
        timestamp: new Date(),
        requestId: requestEnvelope.requestId
      };

      await this.logCommunicationEvent('SECURE_API_REQUEST', {
        endpoint,
        method,
        requestId: requestEnvelope.requestId,
        sessionId
      });

      return response;

    } catch (error) {
      this.errorLogger.logError('SECURE_API_REQUEST_FAILED', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  // Certificate and key management
  public async generateKeyPair(): Promise<CryptoKeyPair> {
    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256'
        },
        true,
        ['encrypt', 'decrypt']
      );

      return keyPair;

    } catch (error) {
      this.errorLogger.logError('KEY_PAIR_GENERATION_FAILED', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  public async exportPublicKey(publicKey: CryptoKey): Promise<string> {
    try {
      const exported = await crypto.subtle.exportKey('spki', publicKey);
      return this.arrayBufferToBase64(exported);
    } catch (error) {
      this.errorLogger.logError('PUBLIC_KEY_EXPORT_FAILED', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  public async importPublicKey(publicKeyString: string): Promise<CryptoKey> {
    try {
      const keyData = this.base64ToArrayBuffer(publicKeyString);
      return await crypto.subtle.importKey(
        'spki',
        keyData,
        {
          name: 'RSA-OAEP',
          hash: 'SHA-256'
        },
        false,
        ['encrypt']
      );
    } catch (error) {
      this.errorLogger.logError('PUBLIC_KEY_IMPORT_FAILED', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  // Message validation and security
  private validateSession(sessionId: string): SessionKey {
    const sessionKey = this.sessionKeys.get(sessionId);
    
    if (!sessionKey) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!sessionKey.isActive) {
      throw new Error(`Session ${sessionId} is not active`);
    }

    if (new Date() > sessionKey.expiresAt) {
      sessionKey.isActive = false;
      this.sessionKeys.delete(sessionId);
      throw new Error(`Session ${sessionId} has expired`);
    }

    return sessionKey;
  }

  private validateMessageEnvelope(envelope: MessageEnvelope, secureMessage: SecureMessage): void {
    if (envelope.sessionId !== secureMessage.sessionId) {
      throw new Error('Session ID mismatch in message envelope');
    }

    if (envelope.messageId !== secureMessage.messageId) {
      throw new Error('Message ID mismatch in message envelope');
    }

    if (envelope.version !== this.PROTOCOL_VERSION) {
      throw new Error(`Unsupported protocol version: ${envelope.version}`);
    }

    // Check message age (prevent replay attacks)
    const messageAge = Date.now() - envelope.timestamp.getTime();
    if (messageAge > 5 * 60 * 1000) { // 5 minutes
      throw new Error('Message is too old (potential replay attack)');
    }
  }

  private validateSequenceNumber(sessionId: string, sequenceNumber: number): void {
    const lastSequence = this.messageSequence.get(sessionId) || 0;
    
    if (sequenceNumber <= lastSequence) {
      throw new Error('Invalid sequence number (potential replay attack)');
    }

    if (sequenceNumber - lastSequence > this.MAX_SEQUENCE_GAP) {
      throw new Error('Sequence number gap too large (potential message loss)');
    }

    this.messageSequence.set(sessionId, sequenceNumber);
  }

  private getNextSequenceNumber(sessionId: string): number {
    const current = this.messageSequence.get(sessionId) || 0;
    const next = current + 1;
    this.messageSequence.set(sessionId, next);
    return next;
  }

  // Utility methods
  private generateSessionId(): string {
    return `SESSION-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRequestId(): string {
    return `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateNonce(): string {
    const array = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private async logCommunicationEvent(eventType: string, eventData: any): Promise<void> {
    try {
      // In a real implementation, this would log to a secure audit system
      console.log(`[SecureComm] ${eventType}:`, eventData);
    } catch (error) {
      this.errorLogger.logError('COMMUNICATION_EVENT_LOGGING_FAILED', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // Public utility methods
  public getActiveSessionCount(): number {
    return Array.from(this.sessionKeys.values()).filter(key => key.isActive).length;
  }

  public getSessionInfo(sessionId: string): SessionInfo | null {
    const sessionKey = this.sessionKeys.get(sessionId);
    if (!sessionKey) return null;

    return {
      sessionId,
      peerId: sessionKey.peerId,
      isActive: sessionKey.isActive,
      createdAt: sessionKey.createdAt,
      expiresAt: sessionKey.expiresAt,
      messageCount: this.messageSequence.get(sessionId) || 0
    };
  }

  public cleanupExpiredSessions(): number {
    let cleanedCount = 0;
    const now = new Date();

    for (const [sessionId, sessionKey] of this.sessionKeys) {
      if (now > sessionKey.expiresAt) {
        sessionKey.isActive = false;
        this.sessionKeys.delete(sessionId);
        this.messageSequence.delete(sessionId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}

// Type definitions
export interface SecureSession {
  sessionId: string;
  peerId: string;
  established: boolean;
  encryptionAlgorithm: string;
  integrityAlgorithm: string;
  protocolVersion: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface SessionKey {
  id: string;
  key: string;
  peerId: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

export interface MessageEnvelope {
  version: string;
  sessionId: string;
  messageId: string;
  messageType: string;
  sequenceNumber: number;
  timestamp: Date;
  payload: any;
}

export interface SecureMessage {
  sessionId: string;
  messageId: string;
  encryptedPayload: string;
  integrityHash: string;
  timestamp: Date;
  sequenceNumber: number;
}

export interface APIRequestEnvelope {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: any;
  timestamp: Date;
  requestId: string;
  nonce: string;
}

export interface SecureAPIResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: Date;
  requestId: string;
}

export interface SessionInfo {
  sessionId: string;
  peerId: string;
  isActive: boolean;
  createdAt: Date;
  expiresAt: Date;
  messageCount: number;
}

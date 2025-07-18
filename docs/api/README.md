# Privacy Cohort Tracker API Documentation

The Privacy Cohort Tracker API provides secure, privacy-preserving access to cohort data and privacy management functionality. All API interactions respect user consent and privacy preferences.

## Base URL

```
Production: https://api.privacy-cohort-tracker.com/v1
Staging: https://api-staging.privacy-cohort-tracker.com/v1
```

## Authentication

### API Key Authentication
```http
Authorization: Bearer YOUR_API_KEY
```

### OAuth 2.0 (Recommended)
```http
Authorization: Bearer YOUR_OAUTH_TOKEN
```

### Request Headers
```http
Content-Type: application/json
Accept: application/json
User-Agent: YourApp/1.0
X-Privacy-Consent: required
```

## Privacy-First Design

### Consent Requirements
All API requests must include valid user consent:

```http
X-Privacy-Consent: cohort-access,data-processing
X-Consent-Timestamp: 2024-01-15T10:30:00Z
X-Consent-Version: 1.2
```

### Data Minimization
The API only returns data that:
- Has explicit user consent
- Is necessary for the requested operation
- Respects user's privacy preferences
- Complies with GDPR/CCPA requirements

## Core Endpoints

### 1. Cohort Management

#### Get User Cohorts
Retrieve anonymized cohort assignments for a user.

```http
GET /cohorts/{userId}
```

**Parameters:**
- `userId` (string): Anonymized user identifier
- `include_expired` (boolean): Include expired cohorts (default: false)
- `format` (string): Response format (json, minimal) (default: json)

**Response:**
```json
{
  "user_id": "anon_user_abc123",
  "cohorts": [
    {
      "cohort_id": "tech_enthusiast_2024_01",
      "name": "Technology Enthusiasts",
      "category": "interests",
      "confidence": 0.85,
      "assigned_at": "2024-01-15T10:30:00Z",
      "expires_at": "2024-02-15T10:30:00Z",
      "k_anonymity": 1000,
      "explanation": "Assigned based on technology-related browsing patterns"
    }
  ],
  "privacy_level": "high",
  "last_updated": "2024-01-15T10:30:00Z"
}
```

#### Update Cohort Preferences
Modify user's cohort participation preferences.

```http
PUT /cohorts/{userId}/preferences
```

**Request Body:**
```json
{
  "enabled_categories": ["interests", "demographics"],
  "disabled_cohorts": ["cohort_id_1", "cohort_id_2"],
  "refresh_frequency": "weekly",
  "privacy_level": "high"
}
```

**Response:**
```json
{
  "status": "updated",
  "preferences": {
    "enabled_categories": ["interests", "demographics"],
    "disabled_cohorts": ["cohort_id_1", "cohort_id_2"],
    "refresh_frequency": "weekly",
    "privacy_level": "high"
  },
  "effective_at": "2024-01-15T10:30:00Z"
}
```

### 2. Privacy Management

#### Get Privacy Status
Retrieve user's current privacy settings and status.

```http
GET /privacy/{userId}/status
```

**Response:**
```json
{
  "user_id": "anon_user_abc123",
  "privacy_score": 95,
  "protection_level": "maximum",
  "active_protections": [
    "local_processing",
    "data_encryption",
    "k_anonymity",
    "differential_privacy"
  ],
  "consent_status": {
    "cohort_tracking": {
      "granted": true,
      "timestamp": "2024-01-15T10:30:00Z",
      "expires": "2024-07-15T10:30:00Z"
    },
    "data_sharing": {
      "granted": false,
      "timestamp": null,
      "expires": null
    }
  },
  "data_retention": {
    "cohort_data": "21_days",
    "activity_logs": "7_days",
    "preferences": "indefinite"
  }
}
```

#### Update Privacy Settings
Modify user's privacy configuration.

```http
PUT /privacy/{userId}/settings
```

**Request Body:**
```json
{
  "protection_level": "maximum",
  "data_sharing_enabled": false,
  "cohort_tracking_enabled": true,
  "retention_periods": {
    "cohort_data": "21_days",
    "activity_logs": "7_days"
  },
  "encryption_level": "aes_256"
}
```

### 3. Data Subject Rights (GDPR/CCPA)

#### Data Access Request
Request all data associated with a user.

```http
GET /data-rights/{userId}/access
```

**Query Parameters:**
- `format` (string): Export format (json, csv, xml) (default: json)
- `include_metadata` (boolean): Include processing metadata (default: true)

**Response:**
```json
{
  "request_id": "dar_123456789",
  "user_id": "anon_user_abc123",
  "status": "completed",
  "data_package": {
    "cohorts": [...],
    "preferences": {...},
    "activity_logs": [...],
    "consent_records": [...]
  },
  "metadata": {
    "generated_at": "2024-01-15T10:30:00Z",
    "data_sources": ["local_processing", "preference_storage"],
    "retention_info": {...}
  },
  "download_url": "https://secure-downloads.privacy-cohort-tracker.com/dar_123456789",
  "expires_at": "2024-01-22T10:30:00Z"
}
```

#### Data Deletion Request
Request deletion of user data.

```http
DELETE /data-rights/{userId}/delete
```

**Request Body:**
```json
{
  "deletion_scope": "all", // "all", "cohorts", "preferences", "logs"
  "reason": "user_request",
  "confirmation": "I understand this action is irreversible"
}
```

**Response:**
```json
{
  "request_id": "ddr_123456789",
  "status": "completed",
  "deleted_data": [
    "cohort_assignments",
    "activity_logs",
    "preference_settings"
  ],
  "retained_data": [
    "consent_records" // Required for legal compliance
  ],
  "deletion_certificate": "https://certificates.privacy-cohort-tracker.com/ddr_123456789",
  "completed_at": "2024-01-15T10:30:00Z"
}
```

#### Data Portability Request
Export user data in a portable format.

```http
POST /data-rights/{userId}/portability
```

**Request Body:**
```json
{
  "format": "json", // "json", "csv", "xml"
  "include_metadata": true,
  "data_types": ["cohorts", "preferences", "activity_logs"]
}
```

### 4. Consent Management

#### Record Consent
Record user consent for specific processing activities.

```http
POST /consent/{userId}/record
```

**Request Body:**
```json
{
  "consent_type": "cohort_tracking",
  "granted": true,
  "purposes": ["personalization", "analytics"],
  "legal_basis": "consent",
  "consent_method": "explicit_opt_in",
  "timestamp": "2024-01-15T10:30:00Z",
  "ip_address": "192.168.1.1", // Optional, for audit trail
  "user_agent": "Mozilla/5.0..." // Optional, for audit trail
}
```

**Response:**
```json
{
  "consent_id": "consent_123456789",
  "status": "recorded",
  "effective_at": "2024-01-15T10:30:00Z",
  "expires_at": "2024-07-15T10:30:00Z",
  "withdrawal_url": "https://privacy-cohort-tracker.com/consent/withdraw/consent_123456789"
}
```

#### Withdraw Consent
Withdraw previously granted consent.

```http
DELETE /consent/{userId}/{consentId}
```

**Response:**
```json
{
  "consent_id": "consent_123456789",
  "status": "withdrawn",
  "withdrawn_at": "2024-01-15T10:30:00Z",
  "data_processing_stopped": true,
  "cleanup_scheduled": "2024-01-16T10:30:00Z"
}
```

### 5. Analytics & Insights

#### Privacy Analytics
Get privacy-preserving analytics about cohort performance.

```http
GET /analytics/cohorts
```

**Query Parameters:**
- `date_range` (string): Time period (7d, 30d, 90d)
- `aggregation_level` (string): Aggregation level (daily, weekly, monthly)
- `min_k_anonymity` (integer): Minimum k-anonymity threshold (default: 100)

**Response:**
```json
{
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "cohort_stats": [
    {
      "cohort_category": "interests",
      "total_cohorts": 150,
      "avg_size": 2500,
      "min_k_anonymity": 1000,
      "privacy_score": 98
    }
  ],
  "privacy_metrics": {
    "avg_k_anonymity": 2500,
    "differential_privacy_epsilon": 0.1,
    "data_retention_compliance": 100
  }
}
```

## Error Handling

### Error Response Format
```json
{
  "error": {
    "code": "INSUFFICIENT_CONSENT",
    "message": "User consent required for this operation",
    "details": {
      "required_consent": ["cohort_access", "data_processing"],
      "current_consent": ["cohort_access"],
      "consent_url": "https://privacy-cohort-tracker.com/consent"
    },
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_123456789"
  }
}
```

### Common Error Codes
- `400 BAD_REQUEST`: Invalid request parameters
- `401 UNAUTHORIZED`: Invalid or missing authentication
- `403 INSUFFICIENT_CONSENT`: Missing required user consent
- `404 NOT_FOUND`: Resource not found
- `429 RATE_LIMITED`: Too many requests
- `500 INTERNAL_ERROR`: Server error

## Rate Limiting

### Limits
- **Standard**: 1000 requests/hour per API key
- **Premium**: 10000 requests/hour per API key
- **Enterprise**: Custom limits

### Headers
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642248600
```

## SDKs and Libraries

### JavaScript/TypeScript
```bash
npm install @privacy-cohort-tracker/api-client
```

```javascript
import { PrivacyCohortAPI } from '@privacy-cohort-tracker/api-client';

const client = new PrivacyCohortAPI({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.privacy-cohort-tracker.com/v1'
});

const cohorts = await client.cohorts.get('user-id');
```

### Python
```bash
pip install privacy-cohort-tracker
```

```python
from privacy_cohort_tracker import PrivacyCohortAPI

client = PrivacyCohortAPI(api_key='your-api-key')
cohorts = client.cohorts.get('user-id')
```

### Java
```xml
<dependency>
    <groupId>com.privacy-cohort-tracker</groupId>
    <artifactId>api-client</artifactId>
    <version>1.0.0</version>
</dependency>
```

```java
PrivacyCohortAPI client = new PrivacyCohortAPI("your-api-key");
CohortResponse cohorts = client.cohorts().get("user-id");
```

## Webhooks

### Consent Changes
Receive notifications when user consent changes.

```http
POST https://your-app.com/webhooks/consent-changed
```

**Payload:**
```json
{
  "event": "consent.changed",
  "user_id": "anon_user_abc123",
  "consent_type": "cohort_tracking",
  "old_status": "granted",
  "new_status": "withdrawn",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Data Deletion Completed
Notification when data deletion is completed.

```http
POST https://your-app.com/webhooks/data-deleted
```

**Payload:**
```json
{
  "event": "data.deleted",
  "user_id": "anon_user_abc123",
  "deletion_request_id": "ddr_123456789",
  "deleted_data_types": ["cohorts", "preferences"],
  "completed_at": "2024-01-15T10:30:00Z"
}
```

## Testing

### Sandbox Environment
```
Base URL: https://api-sandbox.privacy-cohort-tracker.com/v1
```

### Test Data
Use these test user IDs in sandbox:
- `test_user_001`: Standard user with all consents
- `test_user_002`: User with limited consents
- `test_user_003`: User with no consents

### Postman Collection
Download our Postman collection: [Privacy Cohort Tracker API.postman_collection.json](https://docs.privacy-cohort-tracker.com/postman)

## Support

- **API Documentation**: https://docs.privacy-cohort-tracker.com/api
- **Developer Support**: api-support@privacy-cohort-tracker.com
- **Status Page**: https://status.privacy-cohort-tracker.com
- **GitHub Issues**: https://github.com/privacy-cohort-tracker/api-issues

---

**Privacy Notice**: This API is designed with privacy-by-design principles. All data processing respects user consent and complies with GDPR, CCPA, and other privacy regulations.

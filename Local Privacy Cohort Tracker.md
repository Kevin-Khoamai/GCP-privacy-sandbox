# Product Requirements Document (PRD): Local Privacy Cohort Tracker

## Product Name
Local Privacy Cohort Tracker

## Product Vision
To develop a privacy-respecting, cohort-based tracking system that operates entirely on the user’s local device, replacing third-party cookies. This product aligns with Google’s Privacy Sandbox initiative, enabling interest-based advertising while ensuring user data remains private and secure.

## Target Users
- **Web Users**: Individuals seeking control over their data while accessing relevant content and ads.
- **Advertisers**: Companies needing privacy-compliant solutions for targeted advertising.
- **Publishers**: Website owners aiming to sustain ad revenue while adhering to privacy regulations.
- **Developers**: First-party and third-party developers transitioning from cookie-based solutions to Privacy Sandbox APIs.

## Background
Google’s Privacy Sandbox, launched in 2019, aims to replace third-party cookies with privacy-preserving technologies. The Topics API assigns users to interest-based cohorts based on local browsing history, while FLEDGE and Attribution Reporting support ad targeting and measurement without cross-site tracking. The Privacy Sandbox Analysis Tool (PSAT) from GoogleChromeLabs provides a Chrome extension and CLI to analyze cookie usage and Privacy Sandbox API behavior, offering insights into transitioning to these APIs. As of July 17, 2025, Google has paused full third-party cookie deprecation, allowing user choice, but Privacy Sandbox APIs remain critical for privacy-focused solutions.[](https://github.com/GoogleChromeLabs/ps-analysis-tool)[](https://github.com/GoogleChromeLabs/ps-analysis-tool/blob/main/README.md)[](https://github.com/GoogleChromeLabs/ps-analysis-tool/wiki/)

## Key Features
### 1. Local Cohort Assignment
- **Description**: Analyzes browsing history on the user’s device to assign users to interest-based cohorts (e.g., “Fitness,” “Travel”).
- **Details**:
  - Processing occurs locally, with no external server involvement.
  - Uses a taxonomy of ~469 topics, similar to the Topics API, to categorize websites.
  - Cohort data is stored locally and updated weekly, with a retention period of three weeks.
- **Example**: Visiting a fitness blog assigns the user to a “Fitness” cohort.

### 2. Privacy Controls
- **Description**: Provides users with transparency and control over cohort assignments.
- **Details**:
  - Users can view, modify, or disable cohorts via a user interface.
  - Clear explanations of cohort usage and data handling.
  - Consent mechanisms to comply with GDPR and CCPA.
- **Example**: Users can remove the “Travel” cohort if they prefer not to be associated with it.

### 3. Ad Targeting Integration
- **Description**: Offers APIs for advertisers to target ads based on cohort IDs without accessing individual data.
- **Details**:
  - Shares anonymized cohort IDs with websites and ad platforms.
  - Compatible with existing ad tech stacks, leveraging FLEDGE-like mechanisms.
- **Example**: An advertiser targets “Tech Enthusiast” cohorts for gadget ads.

### 4. Measurement and Attribution
- **Description**: Enables privacy-preserving measurement of ad performance.
- **Details**:
  - Supports metrics like impressions and click-through rates via anonymized cohort data.
  - Aligns with Attribution Reporting API principles for aggregated reporting.
- **Example**: Publishers receive reports on ad views by “Food & Drink” cohort users.

## Non-Functional Requirements
| **Requirement** | **Description** |
|-----------------|-----------------|
| **Privacy**     | All processing and storage occur on the user’s device; no individual data is shared. |
| **Security**    | Cohort data is encrypted and isolated to prevent unauthorized access. |
| **Performance** | Minimal impact on device performance, with lightweight algorithms. |
| **Compatibility**| Supports Chrome, Firefox, Safari, Android, and iOS platforms. |
| **Scalability** | Handles large user bases efficiently, with modular architecture. |

## Technical Approach
- **Browser Extension**:
  - Built using WebExtensions API for cross-browser compatibility (Chrome, Firefox, Safari).
  - Leverages PSAT’s approach to integrate with Chrome DevTools for debugging.[](https://github.com/GoogleChromeLabs/ps-analysis-tool)
  - Uses `chrome.storage` or `browser.storage` for secure local storage.
- **Mobile App**:
  - Standalone app or integrated module for Android and iOS.
  - Uses platform-specific secure storage (e.g., Android EncryptedSharedPreferences, iOS Keychain).
- **APIs**:
  - RESTful APIs for advertisers to query cohort IDs securely.
  - Inspired by PSAT’s modular architecture for decoupled interfaces.[](https://github.com/GoogleChromeLabs/ps-analysis-tool/issues/11)

## Development Tasks
### 1. Research and Design
#### Task 1.1: Study Privacy Sandbox APIs for Best Practices
- **Description**: Investigate Google’s Privacy Sandbox APIs to inform the product’s design, focusing on Topics, FLEDGE, and Attribution Reporting.
- **Subtasks**:
  - Review Topics API for cohort assignment mechanics, including taxonomy structure (~469 topics) and privacy safeguards (e.g., three-topic limit, user controls).[](https://github.com/GoogleChromeLabs/ps-analysis-tool/wiki/)
  - Study FLEDGE for on-device ad auctions to inform ad targeting integration.
  - Analyze Attribution Reporting for privacy-preserving measurement techniques.
  - Use PSAT’s documentation and wiki to understand API integration and debugging.[](https://github.com/GoogleChromeLabs/ps-analysis-tool)[](https://github.com/GoogleChromeLabs/ps-analysis-tool/discussions/419)[](https://github.com/GoogleChromeLabs/ps-analysis-tool/wiki/)
  - Explore PSAT’s capabilities for auditing cookie usage and mapping to Privacy Sandbox APIs.[](https://github.com/GoogleChromeLabs/ps-analysis-tool)
- **Deliverables**:
  - Report summarizing API functionalities, limitations, and integration strategies.
  - Recommendations for aligning with Privacy Sandbox standards.
- **Duration**: 1-2 weeks
- **Resources**:
  - [Google Privacy Sandbox Overview](https://privacysandbox.google.com/)
  - [Topics API Documentation](https://privacysandbox.google.com/private-advertising/topics)
  - [PSAT Wiki](https://github.com/GoogleChromeLabs/ps-analysis-tool/wiki)[](https://github.com/GoogleChromeLabs/ps-analysis-tool/discussions/419)[](https://github.com/GoogleChromeLabs/ps-analysis-tool/wiki/)

#### Task 1.2: Design Cohort Assignment Logic Based on Website Categorization
- **Description**: Develop logic to assign users to cohorts based on browsing history, using a taxonomy inspired by the Topics API.
- **Subtasks**:
  - Define a hierarchical taxonomy of ~469 topics, excluding sensitive categories (e.g., race, religion).[](https://github.com/GoogleChromeLabs/ps-analysis-tool/wiki/)
  - Create a domain-to-topic mapping for common websites (e.g., “example.com” → “Technology”).
  - Design fallback methods for uncategorized domains, such as keyword matching (e.g., “fitness” in domain → “Fitness” topic).
  - Implement weekly cohort updates, selecting the top 5 topics based on visit frequency and sharing 3 topics (one per week for three weeks).
  - Ensure logic is lightweight for on-device processing, drawing from PSAT’s performance optimizations.[](https://github.com/GoogleChromeLabs/ps-analysis-tool/pulls)
- **Deliverables**:
  - Taxonomy structure and domain mapping database.
  - Algorithm for cohort assignment, including fallback logic.
  - Prototype for testing assignment accuracy.
- **Duration**: 2-3 weeks
- **Resources**:
  - [Topics API Taxonomy](https://github.com/patcg-individual-drafts/topics/blob/main/taxonomy_v2.md)
  - PSAT’s approach to analyzing website dependencies.[](https://github.com/GoogleChromeLabs/ps-analysis-tool)

#### Task 1.3: Plan Secure Local Storage and Processing Architecture
- **Description**: Design a secure, efficient system for storing and processing cohort data on the user’s device.
- **Subtasks**:
  - Select storage mechanisms:
    - Browser extensions: Use `chrome.storage` or `browser.storage` for isolated storage.[](https://github.com/GoogleChromeLabs/ps-analysis-tool)
    - Mobile apps: Use Android EncryptedSharedPreferences or iOS Keychain.
  - Implement encryption for all stored data (browsing history domains, cohort IDs).
  - Design processing pipeline for real-time or weekly cohort updates, minimizing CPU/memory usage.
  - Plan user controls for viewing, modifying, or disabling cohorts, inspired by PSAT’s user interface designs.[](https://github.com/GoogleChromeLabs/ps-analysis-tool/issues/11)
  - Ensure data retention aligns with Topics API (three weeks for cohorts).
  - Incorporate PSAT’s debugging capabilities to validate storage and processing integrity.[](https://github.com/GoogleChromeLabs/ps-analysis-tool)[](https://github.com/GoogleChromeLabs/ps-analysis-tool/discussions/419)
- **Deliverables**:
  - Architecture diagram for storage and processing.
  - Security plan for encryption and access controls.
  - Mockups for user control interfaces.
- **Duration**: 2-3 weeks
- **Resources**:
  - [Chrome Extensions Storage](https://developer.chrome.com/docs/extensions/reference/storage/)
  - [PSAT Wiki](https://github.com/GoogleChromeLabs/ps-analysis-tool/wiki)[](https://github.com/GoogleChromeLabs/ps-analysis-tool/discussions/419)

### 2. Implementation (High-Level)
- **Frontend**: Develop browser extensions and mobile app interfaces for user controls, leveraging PSAT’s DevTools integration for debugging.[](https://github.com/GoogleChromeLabs/ps-analysis-tool)[](https://github.com/GoogleChromeLabs/ps-analysis-tool/issues/11)
- **Backend**: Optional server-side component for taxonomy updates, ensuring no individual data is shared.
- **APIs**: Build RESTful APIs for advertisers, inspired by PSAT’s modular architecture.[](https://github.com/GoogleChromeLabs/ps-analysis-tool/issues/11)

### 3. Testing
- **Tasks**:
  - Use PSAT to audit cohort assignment accuracy and privacy compliance.[](https://github.com/GoogleChromeLabs/ps-analysis-tool)[](https://github.com/GoogleChromeLabs/ps-analysis-tool/discussions/419)
  - Test across browsers (Chrome, Firefox, Safari) and platforms (Android, iOS).
  - Validate encryption and data isolation.
- **Duration**: 3-4 weeks

### 4. Deployment
- **Tasks**:
  - Submit extensions to Chrome Web Store, Firefox Add-ons, and Safari Extensions Gallery.
  - Submit mobile apps to Google Play Store and Apple App Store.
  - Provide documentation, leveraging PSAT’s wiki structure.[](https://github.com/GoogleChromeLabs/ps-analysis-tool/discussions/419)[](https://github.com/GoogleChromeLabs/ps-analysis-tool/wiki/)
- **Duration**: 2-3 weeks

## Additional Considerations
- **Privacy Compliance**: Adhere to GDPR, CCPA, and other regulations, ensuring no cross-site tracking.
- **PSAT Integration**: Use PSAT for debugging and validating cohort assignments during development.[](https://github.com/GoogleChromeLabs/ps-analysis-tool)[](https://github.com/GoogleChromeLabs/ps-analysis-tool/discussions/419)
- **Future-Proofing**: Design for adaptability to evolving Privacy Sandbox standards, as PSAT supports ongoing API changes.[](https://github.com/GoogleChromeLabs/ps-analysis-tool/wiki/)

## Citations
- [Google Privacy Sandbox Overview](https://privacysandbox.google.com/)
- [Topics API Documentation](https://privacysandbox.google.com/private-advertising/topics)
- [PSAT Repository](https://github.com/GoogleChromeLabs/ps-analysis-tool)[](https://github.com/GoogleChromeLabs/ps-analysis-tool)
- [PSAT Wiki](https://github.com/GoogleChromeLabs/ps-analysis-tool/wiki)[](https://github.com/GoogleChromeLabs/ps-analysis-tool/discussions/419)[](https://github.com/GoogleChromeLabs/ps-analysis-tool/wiki/)
- [Topics API Specification](https://patcg-individual-drafts.github.io/topics/)
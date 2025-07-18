import { UserDataExport } from './common';

export interface CohortDisplayData {
  topicName: string;
  description: string;
  isActive: boolean;
  assignedDate: Date;
  expiryDate: Date;
  canDisable: boolean;
  topicId: number;
}

export interface PrivacyControlsUI {
  displayCurrentCohorts(): CohortDisplayData[];
  toggleCohortStatus(topicId: number, enabled: boolean): void;
  exportUserData(): UserDataExport;
  deleteAllData(): void;
  showDataUsageExplanation(): void;
}
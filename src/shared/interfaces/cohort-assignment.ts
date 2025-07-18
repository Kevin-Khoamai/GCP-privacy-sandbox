import { CohortAssignment, TopicTaxonomy } from './common';
import { DomainVisit } from './browsing-history';

export interface CohortAssignmentEngine {
  assignCohorts(domainVisits: DomainVisit[]): CohortAssignment[];
  updateWeeklyCohorts(): void;
  getCohortTaxonomy(): TopicTaxonomy;
}
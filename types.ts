export type IssueCategory = 'Pothole' | 'Water Leak' | 'Streetlight' | 'Waste Dumping' | 'Public Infrastructure' | 'Other';

export type IssueStatus = 'Pending' | 'In Progress' | 'Resolved';

export type IssueSeverity = 'Low' | 'Medium' | 'High' | 'Critical';

export interface IssueHistory {
  status: IssueStatus;
  updatedAt: string;
  comment: string;
}

export interface IssueLocation {
  lat: number;
  lng: number;
  address: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  location: IssueLocation;
  status: IssueStatus;
  severity: IssueSeverity;
  estimatedImpact: string;
  recommendedAction: string;
  imageUrl?: string;
  votes: number;
  votedUsers: string[]; // IP, fingerprint or custom email
  verifications: number;
  verifiedUsers: string[];
  createdAt: string;
  updatedAt: string;
  history: IssueHistory[];
  aiGenerated: boolean;
  reporterName: string;
  reporterEmail: string;
}

export interface CivicStats {
  totalIssues: number;
  pendingIssues: number;
  inProgressIssues: number;
  resolvedIssues: number;
  totalVotes: number;
  totalVerifications: number;
}

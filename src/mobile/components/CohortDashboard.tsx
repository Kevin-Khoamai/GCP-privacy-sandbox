import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Share,
  Platform
} from 'react-native';
import { privacyControls } from '../../shared/core/privacy-controls';
import { CohortDisplayData } from '../../shared/interfaces/privacy-controls';
import { UserPreferences } from '../../shared/interfaces/common';

interface CohortStatistics {
  totalCohorts: number;
  activeCohorts: number;
  disabledCohorts: number;
  expiringCohorts: number;
}

/**
 * Mobile cohort management dashboard component
 * Provides responsive UI for managing privacy cohorts on mobile devices
 */
export const CohortDashboard: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cohorts, setCohorts] = useState<CohortDisplayData[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [statistics, setStatistics] = useState<CohortStatistics>({
    totalCohorts: 0,
    activeCohorts: 0,
    disabledCohorts: 0,
    expiringCohorts: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  /**
   * Load cohort and preference data
   */
  const loadData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const [cohortsData, preferencesData, statsData] = await Promise.all([
        privacyControls.displayCurrentCohorts(),
        privacyControls.getPrivacySettings(),
        privacyControls.getCohortStatistics()
      ]);

      setCohorts(cohortsData);
      setPreferences(preferencesData);
      setStatistics(statsData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
      setError(errorMessage);
      console.error('Failed to load cohort data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  /**
   * Handle global cohort toggle
   */
  const handleGlobalToggle = async (enabled: boolean) => {
    if (!preferences) return;

    try {
      const updatedPreferences = { ...preferences, cohortsEnabled: enabled };
      await privacyControls.updatePrivacySettings(updatedPreferences);
      setPreferences(updatedPreferences);
      await loadData();
    } catch (err) {
      console.error('Failed to update global toggle:', err);
      Alert.alert('Error', 'Failed to update privacy settings');
    }
  };

  /**
   * Handle individual cohort toggle
   */
  const handleCohortToggle = async (topicId: number, enabled: boolean) => {
    try {
      await privacyControls.toggleCohortStatus(topicId, enabled);
      await loadData();
    } catch (err) {
      console.error('Failed to toggle cohort:', err);
      Alert.alert('Error', 'Failed to update cohort settings');
    }
  };

  /**
   * Handle data export
   */
  const handleDataExport = async () => {
    try {
      const exportData = await privacyControls.exportUserData();
      const jsonString = JSON.stringify(exportData, null, 2);
      
      if (Platform.OS === 'ios') {
        await Share.share({
          message: jsonString,
          title: 'Privacy Cohort Data Export'
        });
      } else {
        await Share.share({
          message: jsonString,
          title: 'Privacy Cohort Data Export'
        });
      }
    } catch (err) {
      console.error('Failed to export data:', err);
      Alert.alert('Error', 'Failed to export data');
    }
  };

  /**
   * Handle delete all data
   */
  const handleDeleteAllData = () => {
    Alert.alert(
      'Delete All Data',
      'Are you sure you want to delete all your cohort data? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await privacyControls.deleteAllData();
              await loadData();
              Alert.alert('Success', 'All data deleted successfully');
            } catch (err) {
              console.error('Failed to delete data:', err);
              Alert.alert('Error', 'Failed to delete data');
            }
          }
        }
      ]
    );
  };

  /**
   * Handle settings save
   */
  const handleSaveSettings = async (newPreferences: UserPreferences) => {
    try {
      await privacyControls.updatePrivacySettings(newPreferences);
      setPreferences(newPreferences);
      setSettingsModalVisible(false);
      Alert.alert('Success', 'Settings saved successfully');
    } catch (err) {
      console.error('Failed to save settings:', err);
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  /**
   * Render loading state
   */
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading your privacy settings...</Text>
      </View>
    );
  }

  /**
   * Render error state
   */
  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => loadData()}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={() => loadData(true)} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Privacy Cohort Tracker</Text>
        <View style={styles.statusIndicator}>
          <View style={[
            styles.statusDot,
            { backgroundColor: preferences?.cohortsEnabled ? '#34C759' : '#8E8E93' }
          ]} />
          <Text style={styles.statusText}>
            {preferences?.cohortsEnabled ? 'Active' : 'Inactive'}
          </Text>
        </View>
      </View>

      {/* Statistics */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{statistics.totalCohorts}</Text>
          <Text style={styles.statLabel}>Total Cohorts</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{statistics.activeCohorts}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{statistics.expiringCohorts}</Text>
          <Text style={styles.statLabel}>Expiring Soon</Text>
        </View>
      </View>

      {/* Global Controls */}
      <View style={styles.section}>
        <View style={styles.controlItem}>
          <View style={styles.controlInfo}>
            <Text style={styles.controlTitle}>Cohort Tracking</Text>
            <Text style={styles.controlDescription}>
              Enable or disable all cohort assignments
            </Text>
          </View>
          <Switch
            value={preferences?.cohortsEnabled || false}
            onValueChange={handleGlobalToggle}
            trackColor={{ false: '#E5E5EA', true: '#007AFF' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* Cohorts List */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Interest Cohorts</Text>
          <TouchableOpacity
            style={styles.helpButton}
            onPress={() => setHelpModalVisible(true)}
          >
            <Text style={styles.helpIcon}>?</Text>
          </TouchableOpacity>
        </View>

        {cohorts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyTitle}>No cohorts yet</Text>
            <Text style={styles.emptyDescription}>
              Browse the web to start building your interest profile
            </Text>
          </View>
        ) : (
          cohorts.map((cohort) => (
            <CohortItem
              key={cohort.topicId}
              cohort={cohort}
              onToggle={(enabled) => handleCohortToggle(cohort.topicId, enabled)}
            />
          ))
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => setSettingsModalVisible(true)}
        >
          <Text style={styles.secondaryButtonText}>Privacy Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={handleDataExport}
        >
          <Text style={styles.secondaryButtonText}>Export Data</Text>
        </TouchableOpacity>
      </View>

      {/* Help Modal */}
      <HelpModal
        visible={helpModalVisible}
        onClose={() => setHelpModalVisible(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        visible={settingsModalVisible}
        preferences={preferences}
        onClose={() => setSettingsModalVisible(false)}
        onSave={handleSaveSettings}
        onDeleteAllData={handleDeleteAllData}
      />
    </ScrollView>
  );
};

/**
 * Individual cohort item component
 */
interface CohortItemProps {
  cohort: CohortDisplayData;
  onToggle: (enabled: boolean) => void;
}

const CohortItem: React.FC<CohortItemProps> = ({ cohort, onToggle }) => {
  const assignedDate = new Date(cohort.assignedDate).toLocaleDateString();
  const expiryDate = new Date(cohort.expiryDate).toLocaleDateString();
  const isExpiringSoon = new Date(cohort.expiryDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

  return (
    <View style={[styles.cohortItem, !cohort.isActive && styles.cohortItemDisabled]}>
      <View style={styles.cohortInfo}>
        <Text style={styles.cohortName}>{cohort.topicName}</Text>
        <Text style={styles.cohortDescription}>{cohort.description}</Text>
        <Text style={styles.cohortMeta}>
          Assigned: {assignedDate} • Expires: {expiryDate}
          {isExpiringSoon && ' • Expiring Soon'}
        </Text>
      </View>
      <Switch
        value={cohort.isActive}
        onValueChange={onToggle}
        disabled={!cohort.canDisable}
        trackColor={{ false: '#E5E5EA', true: '#007AFF' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
};

/**
 * Help modal component
 */
interface HelpModalProps {
  visible: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ visible, onClose }) => {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>How Privacy Cohorts Work</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalClose}>Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalContent}>
          <Text style={styles.helpText}>
            {privacyControls.showDataUsageExplanation()}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
};

/**
 * Settings modal component
 */
interface SettingsModalProps {
  visible: boolean;
  preferences: UserPreferences | null;
  onClose: () => void;
  onSave: (preferences: UserPreferences) => void;
  onDeleteAllData: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  preferences,
  onClose,
  onSave,
  onDeleteAllData
}) => {
  const [shareWithAdvertisers, setShareWithAdvertisers] = useState(
    preferences?.shareWithAdvertisers || false
  );
  const [dataRetentionDays, setDataRetentionDays] = useState(
    preferences?.dataRetentionDays || 21
  );

  useEffect(() => {
    if (preferences) {
      setShareWithAdvertisers(preferences.shareWithAdvertisers);
      setDataRetentionDays(preferences.dataRetentionDays);
    }
  }, [preferences]);

  const handleSave = () => {
    if (preferences) {
      onSave({
        ...preferences,
        shareWithAdvertisers,
        dataRetentionDays
      });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalClose}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Privacy Settings</Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={styles.modalSave}>Save</Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.modalContent}>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Share cohorts with advertisers</Text>
              <Text style={styles.settingDescription}>
                Allow websites to access your cohort IDs for relevant advertising
              </Text>
            </View>
            <Switch
              value={shareWithAdvertisers}
              onValueChange={setShareWithAdvertisers}
              trackColor={{ false: '#E5E5EA', true: '#007AFF' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingTitle}>Data retention</Text>
            <Text style={styles.settingDescription}>
              How long to keep cohort assignments
            </Text>
            <View style={styles.retentionOptions}>
              {[7, 14, 21, 30].map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.retentionOption,
                    dataRetentionDays === days && styles.retentionOptionSelected
                  ]}
                  onPress={() => setDataRetentionDays(days)}
                >
                  <Text style={[
                    styles.retentionOptionText,
                    dataRetentionDays === days && styles.retentionOptionTextSelected
                  ]}>
                    {days === 7 ? '1 week' : 
                     days === 14 ? '2 weeks' : 
                     days === 21 ? '3 weeks (recommended)' : 
                     '1 month'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={onDeleteAllData}
          >
            <Text style={styles.deleteButtonText}>Delete All Data</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8E8E93',
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FF3B30',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  statsContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 16,
    paddingHorizontal: 16,
  },
  controlItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  controlInfo: {
    flex: 1,
  },
  controlTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  controlDescription: {
    fontSize: 14,
    color: '#8E8E93',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  helpButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  helpIcon: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  cohortItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  cohortItemDisabled: {
    opacity: 0.6,
  },
  cohortInfo: {
    flex: 1,
    marginRight: 16,
  },
  cohortName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  cohortDescription: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  cohortMeta: {
    fontSize: 12,
    color: '#C7C7CC',
  },
  actionsContainer: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#8E8E93',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  modalHeader: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  modalClose: {
    fontSize: 16,
    color: '#007AFF',
  },
  modalSave: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  helpText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#000000',
  },
  settingItem: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  settingInfo: {
    marginBottom: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#8E8E93',
  },
  retentionOptions: {
    marginTop: 12,
  },
  retentionOption: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
    marginBottom: 8,
  },
  retentionOptionSelected: {
    backgroundColor: '#007AFF',
  },
  retentionOptionText: {
    fontSize: 14,
    color: '#000000',
  },
  retentionOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CohortDashboard;
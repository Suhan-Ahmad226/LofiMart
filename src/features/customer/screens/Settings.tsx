import React from 'react';
import ProfileManager from '@/features/shared/profile/ProfileManager';

export const CustomerSettingsPage = () => {
  return (
    <ProfileManager
      role="customer"
      title="Account Settings"
      description="Manage your profile, addresses, preferences, security, and privacy controls from one place."
    />
  );
};

export default CustomerSettingsPage;

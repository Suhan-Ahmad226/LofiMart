import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Smartphone, Wifi, Bell, HardDrive, Download, Check, X as XIcon } from 'lucide-react';
import { usePWAInstall } from '@/features/shared/pwa/hooks/usePWAInstall';
import { useOffline } from '@/features/shared/pwa/hooks/useOffline';
import { usePushNotifications } from '@/features/shared/pwa/hooks/usePushNotifications';
import { offlineStorage } from '../../../utils/offlineStorage';

export const PWAStatus: React.FC = () => {
  const { isInstalled, isInstallable } = usePWAInstall();
  const { isOnline } = useOffline();
  const { isSupported: pushSupported, isSubscribed } = usePushNotifications();
  const [storageInfo, setStorageInfo] = useState({ cacheSize: 0, queueSize: 0 });
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);

  useEffect(() => {
    const checkServiceWorker = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          setServiceWorkerReady(!!registration);
        } catch (err) {
          console.error('Service Worker not ready:', err);
        }
      }
    };

    const updateStorageInfo = async () => {
      const info = await offlineStorage.getStorageInfo();
      setStorageInfo(info);
    };

    checkServiceWorker();
    updateStorageInfo();

    // Update storage info every 10 seconds
    const interval = setInterval(updateStorageInfo, 10000);
    return () => clearInterval(interval);
  }, []);

  const features = [
    {
      icon: Download,
      title: 'Installable App',
      status: isInstalled ? 'installed' : isInstallable ? 'available' : 'not-available',
      description: isInstalled ? 'App is installed' : 'Ready to install',
    },
    {
      icon: HardDrive,
      title: 'Offline Support',
      status: serviceWorkerReady ? 'active' : 'inactive',
      description: `${storageInfo.cacheSize} cached items`,
    },
    {
      icon: Wifi,
      title: 'Online Status',
      status: isOnline ? 'online' : 'offline',
      description: isOnline ? 'Connected' : 'Disconnected',
    },
    {
      icon: Bell,
      title: 'Push Notifications',
      status: isSubscribed ? 'subscribed' : pushSupported ? 'available' : 'not-available',
      description: isSubscribed ? 'Enabled' : 'Can be enabled',
    },
    {
      icon: Smartphone,
      title: 'Service Worker',
      status: serviceWorkerReady ? 'active' : 'inactive',
      description: serviceWorkerReady ? 'Running' : 'Not running',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'installed':
      case 'subscribed':
      case 'online':
      case 'active':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'available':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'offline':
      case 'inactive':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'not-available':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'installed':
      case 'subscribed':
      case 'online':
      case 'active':
        return <Check className="w-4 h-4" />;
      case 'offline':
      case 'inactive':
        return <XIcon className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Smartphone className="w-6 h-6 text-blue-600" />
        PWA Status
      </h2>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 border rounded-lg hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <Icon className="w-5 h-5 text-blue-600" />
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${getStatusColor(
                    feature.status
                  )}`}
                >
                  {getStatusIcon(feature.status)}
                  <span className="capitalize">{feature.status.replace('-', ' ')}</span>
                </div>
              </div>

              <h3 className="font-semibold text-gray-900 mb-1">{feature.title}</h3>
              <p className="text-sm text-gray-600">{feature.description}</p>
            </motion.div>
          );
        })}
      </div>

      {storageInfo.queueSize > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 p-4 bg-yellow-50 border border-yellow-300 rounded-lg"
        >
          <p className="text-yellow-800 font-medium">
            {storageInfo.queueSize} pending {storageInfo.queueSize === 1 ? 'action' : 'actions'} to sync when online
          </p>
        </motion.div>
      )}

      <div className="mt-6 pt-6 border-t space-y-2">
        <p className="text-sm text-gray-600">
          <strong>Offline Cache:</strong> {storageInfo.cacheSize} items stored
        </p>
        <p className="text-sm text-gray-600">
          <strong>Service Worker:</strong> {serviceWorkerReady ? 'Active and ready' : 'Not available'}
        </p>
        <p className="text-sm text-gray-600">
          <strong>Network Status:</strong> {isOnline ? 'Online' : 'Offline'}
        </p>
      </div>
    </div>
  );
};

export default PWAStatus;

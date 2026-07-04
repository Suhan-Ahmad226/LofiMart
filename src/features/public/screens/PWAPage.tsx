import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Smartphone, Download, Wifi, Bell, HardDrive } from 'lucide-react';
import PWAStatus from '@/src/components/PWAStatus';
import { usePWAInstall } from '@/src/hooks/usePWAInstall';
import { usePushNotifications } from '@/src/hooks/usePushNotifications';
import { offlineStorage } from '@/src/utils/offlineStorage';

export const PWAPage: React.FC = () => {
  const { install, isInstallable } = usePWAInstall();
  const { subscribe, sendNotification } = usePushNotifications();
  const [testMessage, setTestMessage] = useState('');

  const features = [
    {
      icon: Download,
      title: 'Installable App',
      description: 'Install LofiMart on any device as a native-like app with icon on home screen',
      details: [
        'No app store required',
        'Fast launch from home screen',
        'Full-screen experience',
        'Works on Android & iOS',
      ],
    },
    {
      icon: HardDrive,
      title: 'Offline Support',
      description: 'Browse and shop even when your internet connection is down',
      details: [
        'Cached product pages',
        'Offline cart management',
        'Auto-sync when online',
        'Smart cache strategy',
      ],
    },
    {
      icon: Wifi,
      title: 'Smart Sync',
      description: 'Seamless sync between devices while offline',
      details: [
        'Background sync API',
        'Queue offline actions',
        'Auto-retry on connection',
        'Data integrity guaranteed',
      ],
    },
    {
      icon: Bell,
      title: 'Push Notifications',
      description: 'Get instant notifications about orders and exclusive offers',
      details: [
        'Real-time order updates',
        'Flash sale alerts',
        'Personalized recommendations',
        'Rich notification content',
      ],
    },
    {
      icon: Smartphone,
      title: 'App-like Experience',
      description: 'Feels like a native mobile app with smooth animations',
      details: [
        'No browser UI chrome',
        'Gestures like native app',
        'Instant page transitions',
        'System integration',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-12">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="flex justify-center mb-4">
            <Smartphone className="w-16 h-16 text-blue-600" />
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Progressive Web App
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            LofiMart is a progressive web app - enjoy app-like experience directly in your browser
          </p>
        </motion.div>

        {/* PWA Status Dashboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-12"
        >
          <PWAStatus />
        </motion.div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow"
              >
                <Icon className="w-8 h-8 text-blue-600 mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 mb-4">{feature.description}</p>
                <ul className="space-y-2">
                  {feature.details.map((detail) => (
                    <li key={detail} className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="w-2 h-2 bg-blue-600 rounded-full" />
                      {detail}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-lg p-8"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Quick Actions</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {isInstallable && (
              <button
                onClick={install}
                className="p-6 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-left"
              >
                <Download className="w-8 h-8 text-blue-600 mb-2" />
                <h3 className="font-semibold text-gray-900">Install App</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Add LofiMart to your home screen for quick access
                </p>
              </button>
            )}

            <button
              onClick={() => subscribe()}
              className="p-6 border-2 border-green-600 rounded-lg hover:bg-green-50 transition-colors text-left"
            >
              <Bell className="w-8 h-8 text-green-600 mb-2" />
              <h3 className="font-semibold text-gray-900">Enable Notifications</h3>
              <p className="text-sm text-gray-600 mt-1">
                Stay updated with order and offer notifications
              </p>
            </button>

            <button
              onClick={() => sendNotification('Test Notification', { body: 'Push notifications are working!' })}
              className="p-6 border-2 border-purple-600 rounded-lg hover:bg-purple-50 transition-colors text-left"
            >
              <Bell className="w-8 h-8 text-purple-600 mb-2" />
              <h3 className="font-semibold text-gray-900">Test Notification</h3>
              <p className="text-sm text-gray-600 mt-1">
                Send yourself a test notification
              </p>
            </button>

            <button
              onClick={async () => {
                const data = await offlineStorage.getStorageInfo();
                setTestMessage(`Cached items: ${data.cacheSize}, Pending: ${data.queueSize}`);
              }}
              className="p-6 border-2 border-orange-600 rounded-lg hover:bg-orange-50 transition-colors text-left"
            >
              <HardDrive className="w-8 h-8 text-orange-600 mb-2" />
              <h3 className="font-semibold text-gray-900">Check Offline Storage</h3>
              <p className="text-sm text-gray-600 mt-1">
                View cached data and pending actions
              </p>
            </button>
          </div>

          {testMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-blue-50 border border-blue-300 rounded-lg"
            >
              <p className="text-blue-900 font-medium">{testMessage}</p>
            </motion.div>
          )}
        </motion.div>

        {/* Benefits Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-12 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-lg p-8"
        >
          <h2 className="text-2xl font-bold mb-6">Why Use LofiMart PWA?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">⚡ Performance</h3>
              <p>Lightning-fast loading, instant app start, responsive interactions</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">📱 Works Offline</h3>
              <p>Browse products and manage cart even without internet connection</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">🔔 Stay Connected</h3>
              <p>Push notifications for orders, offers, and personalized recommendations</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">🏠 Home Screen</h3>
              <p>One-click installation, native app feel, no app store needed</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">🔒 Secure</h3>
              <p>Always served over HTTPS, protected data, safe transactions</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">♻️ Auto Updates</h3>
              <p>Always get latest features without manual updates or app store reviews</p>
            </div>
          </div>
        </motion.div>

        {/* Browser Support */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-12 bg-white rounded-lg shadow p-8"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Browser Support</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-gray-900">Chrome/Edge</p>
                <p className="text-sm text-gray-600">Full PWA support (v42+)</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-gray-900">Safari</p>
                <p className="text-sm text-gray-600">Full PWA support (iOS 14.1+)</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-gray-900">Firefox</p>
                <p className="text-sm text-gray-600">Install & offline (v55+)</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-gray-900">Android</p>
                <p className="text-sm text-gray-600">Full app-like experience</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default PWAPage;

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationItemProps {
  notification: Notification;
  onClose: (id: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onClose }) => {
  const iconMap = {
    success: <CheckCircle className="w-5 h-5 text-green-600" />,
    error: <AlertCircle className="w-5 h-5 text-red-600" />,
    info: <Info className="w-5 h-5 text-blue-600" />,
    warning: <AlertCircle className="w-5 h-5 text-yellow-600" />,
  };

  const bgColorMap = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200',
    warning: 'bg-yellow-50 border-yellow-200',
  };

  const textColorMap = {
    success: 'text-green-800',
    error: 'text-red-800',
    info: 'text-blue-800',
    warning: 'text-yellow-800',
  };

  React.useEffect(() => {
    if (notification.duration) {
      const timer = setTimeout(() => onClose(notification.id), notification.duration);
      return () => clearTimeout(timer);
    }
  }, [notification, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, x: 400 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: -20, x: 400 }}
      transition={{ duration: 0.3 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${bgColorMap[notification.type]} shadow-md`}
    >
      {iconMap[notification.type]}
      <span className={`flex-1 ${textColorMap[notification.type]}`}>
        {notification.message}
      </span>
      {notification.action && (
        <button
          onClick={notification.action.onClick}
          className={`text-sm font-medium ${textColorMap[notification.type]} hover:opacity-70`}
        >
          {notification.action.label}
        </button>
      )}
      <button
        onClick={() => onClose(notification.id)}
        className={`${textColorMap[notification.type]} hover:opacity-70`}
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

interface NotificationContainerProps {
  notifications: Notification[];
  onClose: (id: string) => void;
}

export const NotificationContainer: React.FC<NotificationContainerProps> = ({
  notifications,
  onClose,
}) => {
  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 max-w-md">
      <AnimatePresence mode="popLayout">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onClose={onClose}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

// Hook for managing notifications
export const useNotification = () => {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);

  const addNotification = React.useCallback(
    (
      message: string,
      type: NotificationType = 'info',
      duration: number = 3000,
      action?: Notification['action']
    ) => {
      const id = `notification-${Date.now()}`;
      const notification: Notification = {
        id,
        message,
        type,
        duration,
        action,
      };

      setNotifications((prev) => [...prev, notification]);
      return id;
    },
    []
  );

  const removeNotification = React.useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const success = (message: string, duration?: number) =>
    addNotification(message, 'success', duration);
  const error = (message: string, duration?: number) =>
    addNotification(message, 'error', duration);
  const info = (message: string, duration?: number) =>
    addNotification(message, 'info', duration);
  const warning = (message: string, duration?: number) =>
    addNotification(message, 'warning', duration);

  return {
    notifications,
    addNotification,
    removeNotification,
    success,
    error,
    info,
    warning,
  };
};

export default NotificationContainer;

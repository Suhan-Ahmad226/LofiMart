export type TelegramInlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: {
    url: string;
  };
};

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: {
      id: number;
      type: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    from?: {
      id: number;
      is_bot?: boolean;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: {
      message_id: number;
      chat: {
        id: number;
        type: string;
      };
    };
    from: {
      id: number;
      is_bot?: boolean;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
};

export type OrderLifecycleStatus = 'pending' | 'accepted' | 'shipped' | 'delivered' | 'cancelled';

export type TelegramNotificationType =
  | 'new_order'
  | 'order_accepted'
  | 'order_shipped'
  | 'low_stock'
  | 'payment_received'
  | 'commission_earned';

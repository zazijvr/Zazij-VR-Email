import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import CustomAlert, { type AlertType } from './CustomAlert';

export interface ConfirmOptions {
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
}

interface AlertContextValue {
  showAlert: (message: string, title?: string | null, type?: AlertType) => void;
  showConfirm: (message: string, title: string | undefined, onConfirm?: () => void, options?: ConfirmOptions) => void;
}

interface AlertConfig {
  message: string;
  title: string | null;
  type: AlertType;
  isOpen: boolean;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
}

const AlertContext = createContext<AlertContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- hook patří ke kontextu v tomtéž souboru
export const useAlert = (): AlertContextValue => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert musí být použit uvnitř AlertProvideru');
  }
  return context;
};

export const AlertProvider = ({ children }: { children: ReactNode }) => {
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);

  const showAlert = useCallback<AlertContextValue['showAlert']>((message, title = null, type = 'info') => {
    setAlertConfig({ message, title, type, isOpen: true });
  }, []);

  const showConfirm = useCallback<AlertContextValue['showConfirm']>((message, title = 'Potvrzení', confirmCallback, options = {}) => {
    setAlertConfig({
      message,
      title,
      type: options.type || 'warning',
      isOpen: true,
      onConfirm: () => confirmCallback?.(),
      confirmText: options.confirmText || 'Potvrdit',
      cancelText: options.cancelText || 'Zrušit',
    });
  }, []);

  const hideAlert = useCallback(() => {
    setAlertConfig((prev) => (prev ? { ...prev, isOpen: false } : null));
  }, []);

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {alertConfig && (
        <CustomAlert
          isOpen={alertConfig.isOpen}
          title={alertConfig.title}
          message={alertConfig.message}
          type={alertConfig.type}
          onClose={hideAlert}
          onConfirm={alertConfig.onConfirm}
          confirmText={alertConfig.confirmText}
          cancelText={alertConfig.cancelText}
        />
      )}
    </AlertContext.Provider>
  );
};

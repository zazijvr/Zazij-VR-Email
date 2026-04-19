import React, { createContext, useContext, useState, useCallback } from 'react';
import CustomAlert from './CustomAlert';

const AlertContext = createContext(null);

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert musí být použit uvnitř AlertProvideru');
  }
  return context;
};

export const AlertProvider = ({ children }) => {
  const [alertConfig, setAlertConfig] = useState(null);

  const showAlert = useCallback((message, title = null, type = 'info') => {
    setAlertConfig({ message, title, type, isOpen: true });
  }, []);

  const showConfirm = useCallback((message, title = 'Potvrzení', confirmCallback, options = {}) => {
    setAlertConfig({ 
      message, 
      title, 
      type: options.type || 'warning', 
      isOpen: true, 
      onConfirm: () => {
        if (confirmCallback) confirmCallback();
      },
      confirmText: options.confirmText || 'Potvrdit',
      cancelText: options.cancelText || 'Zrušit'
    });
  }, []);

  const hideAlert = useCallback(() => {
    setAlertConfig(prev => (prev ? { ...prev, isOpen: false } : null));
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

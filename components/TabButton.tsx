import React from 'react';

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}

export const TabButton: React.FC<TabButtonProps> = ({ active, onClick, label, icon }) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${
        active
          ? 'border-primary-500 text-primary-400 bg-gray-850'
          : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-850'
      }`}
    >
      {icon}
      {label}
    </button>
  );
};

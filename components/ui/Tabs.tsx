'use client';

import React, { createContext, useContext, useState } from 'react';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProps {
  defaultTab: string;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ defaultTab, children, className = '' }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabListProps {
  children: React.ReactNode;
  className?: string;
}

export function TabList({ children, className = '' }: TabListProps) {
  return (
    <div className={`flex gap-1 p-1 glass rounded-xl ${className}`}>
      {children}
    </div>
  );
}

interface TabProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function Tab({ value, children, className = '' }: TabProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tab must be used within Tabs');

  const isActive = context.activeTab === value;

  return (
    <button
      onClick={() => context.setActiveTab(value)}
      className={`
        px-4 py-2 rounded-lg text-sm font-medium
        transition-all duration-200
        ${isActive
          ? 'bg-white/10 text-white shadow-lg'
          : 'text-white/60 hover:text-white hover:bg-white/5'
        }
        ${className}
      `}
    >
      {children}
    </button>
  );
}

interface TabPanelProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabPanel({ value, children, className = '' }: TabPanelProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabPanel must be used within Tabs');

  if (context.activeTab !== value) return null;

  return (
    <div className={`animate-fade-in ${className}`}>
      {children}
    </div>
  );
}


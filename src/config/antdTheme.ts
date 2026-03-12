/**
 * Ant Design Theme Configuration
 * Huy Anh Rubber ERP - Industrial Green Theme
 * 
 * Sử dụng: Wrap App với ConfigProvider
 * <ConfigProvider theme={antdTheme}>
 *   <App />
 * </ConfigProvider>
 */

import type { ThemeConfig } from 'antd';

// ==========================================
// COLOR PALETTE - Industrial Rubber Theme
// ==========================================
export const colors = {
  // Primary - Industrial Green
  primary: '#1B4D3E',
  primaryHover: '#2D8B6E',
  primaryActive: '#0D2E25',
  primaryBg: '#E8F5F0',
  
  // Secondary
  secondary: '#2D8B6E',
  
  // Accent
  accent: '#E8A838',
  accentHover: '#D4922A',
  
  // Status Colors
  success: '#52c41a',
  warning: '#faad14',
  error: '#ff4d4f',
  info: '#1890ff',
  
  // Tier Colors (for partner badges)
  tierDiamond: '#B8860B',
  tierGold: '#FAAD14',
  tierSilver: '#8C8C8C',
  tierBronze: '#D48806',
  tierNew: '#1890FF',
  
  // Neutral
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  textDisabled: '#9CA3AF',
  border: '#E5E7EB',
  background: '#F9FAFB',
  backgroundDark: '#F3F4F6',
  
  // Chat bubbles
  chatFactory: '#1B4D3E',
  chatPartner: '#F0F0F0',
  
  // Booking card status
  bookingPending: '#FFF9E6',
  bookingConfirmed: '#F6FFED',
  bookingRejected: '#FFF2F0',
  bookingNegotiating: '#E6F7FF',
};

// ==========================================
// TYPOGRAPHY
// ==========================================
export const typography = {
  fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontFamilyCode: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  fontSize: 14,
  fontSizeHeading1: 32,
  fontSizeHeading2: 26,
  fontSizeHeading3: 22,
  fontSizeHeading4: 18,
  fontSizeHeading5: 16,
};

// ==========================================
// SPACING & SIZING
// ==========================================
export const sizing = {
  borderRadius: 8,
  borderRadiusLG: 12,
  borderRadiusSM: 6,
  controlHeight: 40,
  controlHeightLG: 48,
  controlHeightSM: 32,
};

// ==========================================
// ANT DESIGN THEME CONFIG
// ==========================================
export const antdTheme: ThemeConfig = {
  token: {
    // Colors
    colorPrimary: colors.primary,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorError: colors.error,
    colorInfo: colors.info,
    
    // Typography
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSize,
    
    // Border
    borderRadius: sizing.borderRadius,
    borderRadiusLG: sizing.borderRadiusLG,
    borderRadiusSM: sizing.borderRadiusSM,
    
    // Control
    controlHeight: sizing.controlHeight,
    controlHeightLG: sizing.controlHeightLG,
    controlHeightSM: sizing.controlHeightSM,
    
    // Link
    colorLink: colors.primary,
    colorLinkHover: colors.primaryHover,
    colorLinkActive: colors.primaryActive,
    
    // Background
    colorBgContainer: '#FFFFFF',
    colorBgLayout: colors.background,
    colorBgElevated: '#FFFFFF',
    
    // Text
    colorText: colors.textPrimary,
    colorTextSecondary: colors.textSecondary,
    colorTextDisabled: colors.textDisabled,
    
    // Border
    colorBorder: colors.border,
    colorBorderSecondary: '#F0F0F0',
    
    // Box Shadow
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
    boxShadowSecondary: '0 4px 16px rgba(0, 0, 0, 0.08)',
  },
  
  components: {
    // Layout
    Layout: {
      headerBg: '#FFFFFF',
      siderBg: colors.primary,
      bodyBg: colors.background,
      headerHeight: 64,
    },
    
    // Menu (Sider)
    Menu: {
      darkItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(255, 255, 255, 0.15)',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.1)',
      darkItemColor: 'rgba(255, 255, 255, 0.85)',
      darkItemSelectedColor: '#FFFFFF',
      itemHeight: 48,
      iconSize: 18,
    },
    
    // Card
    Card: {
      borderRadiusLG: 12,
      paddingLG: 20,
      boxShadowTertiary: '0 2px 8px rgba(0, 0, 0, 0.06)',
    },
    
    // Table
    Table: {
      headerBg: colors.backgroundDark,
      headerColor: colors.textPrimary,
      rowHoverBg: '#FAFAFA',
      borderColor: colors.border,
      headerBorderRadius: 8,
    },
    
    // Button
    Button: {
      borderRadius: sizing.borderRadius,
      controlHeight: sizing.controlHeight,
      paddingContentHorizontal: 16,
      primaryShadow: 'none',
      defaultShadow: 'none',
    },
    
    // Input
    Input: {
      borderRadius: sizing.borderRadius,
      controlHeight: sizing.controlHeight,
      paddingInline: 12,
    },
    
    // Select
    Select: {
      borderRadius: sizing.borderRadius,
      controlHeight: sizing.controlHeight,
    },
    
    // DatePicker
    DatePicker: {
      borderRadius: sizing.borderRadius,
      controlHeight: sizing.controlHeight,
    },
    
    // Modal
    Modal: {
      borderRadiusLG: 12,
      paddingContentHorizontalLG: 24,
    },
    
    // Tabs
    Tabs: {
      itemColor: colors.textSecondary,
      itemSelectedColor: colors.primary,
      itemHoverColor: colors.primaryHover,
      inkBarColor: colors.primary,
    },
    
    // Tag
    Tag: {
      borderRadiusSM: 6,
    },
    
    // Badge
    Badge: {
      colorBgContainer: colors.error,
    },
    
    // Avatar
    Avatar: {
      borderRadius: sizing.borderRadius,
    },
    
    // List
    List: {
      itemPadding: '12px 0',
    },
    
    // Timeline
    Timeline: {
      dotBg: '#FFFFFF',
    },
    
    // Steps
    Steps: {
      iconSize: 32,
    },
    
    // Progress
    Progress: {
      defaultColor: colors.primary,
      remainingColor: '#F0F0F0',
    },
    
    // Statistic
    Statistic: {
      titleFontSize: 13,
      contentFontSize: 28,
    },
    
    // Form
    Form: {
      labelColor: colors.textSecondary,
      labelFontSize: 13,
      verticalLabelPadding: '0 0 4px',
    },
    
    // Alert
    Alert: {
      borderRadiusLG: 8,
    },
    
    // Message
    Message: {
      contentBg: '#FFFFFF',
    },
    
    // Notification
    Notification: {
      width: 384,
    },
    
    // Dropdown
    Dropdown: {
      borderRadiusLG: 8,
      paddingBlock: 8,
    },
    
    // Popconfirm
    Popconfirm: {
      borderRadiusLG: 8,
    },
  },
};

// ==========================================
// HELPER: CSS Variables for custom styling
// ==========================================
export const cssVariables = `
  :root {
    --color-primary: ${colors.primary};
    --color-primary-hover: ${colors.primaryHover};
    --color-primary-active: ${colors.primaryActive};
    --color-primary-bg: ${colors.primaryBg};
    --color-secondary: ${colors.secondary};
    --color-accent: ${colors.accent};
    --color-success: ${colors.success};
    --color-warning: ${colors.warning};
    --color-error: ${colors.error};
    --color-info: ${colors.info};
    --color-text-primary: ${colors.textPrimary};
    --color-text-secondary: ${colors.textSecondary};
    --color-border: ${colors.border};
    --color-background: ${colors.background};
    --font-family: ${typography.fontFamily};
    --font-family-code: ${typography.fontFamilyCode};
    --border-radius: ${sizing.borderRadius}px;
    --border-radius-lg: ${sizing.borderRadiusLG}px;
  }
`;

export default antdTheme;

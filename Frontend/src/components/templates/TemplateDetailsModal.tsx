import React from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Template, TemplateStatus } from '@/services/whatsappTemplateService';

interface TemplateDetailsModalProps {
  template: Template;
  isOpen: boolean;
  onClose: () => void;
}

const TemplateDetailsModal: React.FC<TemplateDetailsModalProps> = ({
  template,
  isOpen,
  onClose,
}) => {
  const { theme } = useTheme();

  const getStatusBadge = (status: TemplateStatus) => {
    const variants: Record<TemplateStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline', color: string }> = {
      DRAFT: { variant: 'secondary', color: 'text-gray-600' },
      PENDING: { variant: 'outline', color: 'text-yellow-600' },
      APPROVED: { variant: 'default', color: 'text-green-600' },
      REJECTED: { variant: 'destructive', color: 'text-red-600' },
      PAUSED: { variant: 'outline', color: 'text-orange-600' },
      DISABLED: { variant: 'secondary', color: 'text-gray-500' },
    };
    
    const config = variants[status] || variants.DRAFT;
    
    return (
      <Badge variant={config.variant} className={config.color}>
        {status}
      </Badge>
    );
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      MARKETING: 'bg-purple-100 text-purple-800',
      UTILITY: 'bg-blue-100 text-blue-800',
      AUTHENTICATION: 'bg-green-100 text-green-800',
    };
    
    return (
      <Badge variant="outline" className={colors[category] || 'bg-gray-100 text-gray-800'}>
        {category}
      </Badge>
    );
  };

  // Helper to parse components (handles string, array, or object format)
  const parseComponents = () => {
    let components = template.components as any;
    
    if (typeof components === 'string') {
      try {
        components = JSON.parse(components);
      } catch {
        return { array: [], obj: {} };
      }
    }
    
    if (Array.isArray(components)) {
      return { array: components, obj: {} };
    }
    
    if (components && typeof components === 'object') {
      return { array: [], obj: components };
    }
    
    return { array: [], obj: {} };
  };

  const getComponentText = (type: string) => {
    const { array, obj } = parseComponents();
    
    // Try array format
    if (array.length > 0) {
      const component = array.find((c: any) => c.type === type);
      return component?.text || null;
    }
    
    // Try object format (e.g., {body: {...}, header: {...}})
    const key = type.toLowerCase();
    if (obj[key]?.text) return obj[key].text;
    if (obj[type]?.text) return obj[type].text;
    
    return null;
  };

  const getButtons = () => {
    const { array, obj } = parseComponents();
    
    // Try array format
    if (array.length > 0) {
      const buttonsComponent = array.find((c: any) => c.type === 'BUTTONS');
      return buttonsComponent?.buttons || [];
    }
    
    // Try object format
    if (obj.buttons?.buttons) return obj.buttons.buttons;
    if (obj.BUTTONS?.buttons) return obj.BUTTONS.buttons;
    if (Array.isArray(obj.buttons)) return obj.buttons;
    
    return [];
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-lg ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white'}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {template.name}
            {template.status ? getStatusBadge(template.status) : (
              <Badge variant="outline" className="text-gray-500">SYNCED</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Meta Info */}
          <div className="flex items-center gap-4">
            {getCategoryBadge(template.category)}
            <span className="text-sm text-gray-500">Language: {template.language || 'en'}</span>
          </div>

          {/* WhatsApp Preview Style */}
          <div className={`rounded-lg p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-green-50'}`}>
            <div className={`rounded-lg p-3 max-w-[280px] ${theme === 'dark' ? 'bg-gray-700' : 'bg-white'} shadow-sm`}>
              {/* Header - Text or Media */}
              {(() => {
                const headerText = getComponentText('HEADER');
                const headerType = (template as any).header_type;
                const mediaUrl = (template as any).header_media_url;
                
                // Check for media header
                if (mediaUrl && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)) {
                  return (
                    <div className="mb-3">
                      {headerType === 'IMAGE' && (
                        <img 
                          src={mediaUrl} 
                          alt="Header" 
                          className="w-full h-32 object-cover rounded"
                        />
                      )}
                      {headerType === 'VIDEO' && (
                        <video 
                          src={mediaUrl} 
                          controls 
                          className="w-full h-32 rounded"
                        />
                      )}
                      {headerType === 'DOCUMENT' && (
                        <a 
                          href={mediaUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className={`flex items-center gap-2 p-3 rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-100'}`}
                        >
                          <span className="text-2xl">📄</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">Document</p>
                            <p className="text-xs text-gray-500">Click to view</p>
                          </div>
                        </a>
                      )}
                    </div>
                  );
                }
                
                // Text header
                if (headerText) {
                  return (
                    <div className="mb-2">
                      <p className="font-semibold text-sm">{headerText}</p>
                    </div>
                  );
                }
                
                return null;
              })()}

              {/* Body */}
              <p className="text-sm whitespace-pre-wrap">
                {getComponentText('BODY') || 'No body text'}
              </p>

              {/* Footer */}
              {getComponentText('FOOTER') && (
                <p className={`text-xs mt-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  {getComponentText('FOOTER')}
                </p>
              )}

              {/* Buttons */}
              {getButtons().length > 0 && (
                <div className="mt-3 border-t pt-2 space-y-1">
                  {getButtons().map((btn, idx) => (
                    <div
                      key={idx}
                      className={`text-center py-1.5 text-sm rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-100'}`}
                    >
                      {btn.type === 'URL' ? '🔗 ' : btn.type === 'PHONE_NUMBER' ? '📞 ' : ''}
                      {btn.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            <p>Created: {formatDate(template.created_at)}</p>
            <p>Updated: {formatDate(template.updated_at)}</p>
          </div>

          {/* Meta Template ID if approved */}
          {template.meta_template_id && (
            <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              <p>Meta Template ID: {template.meta_template_id}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateDetailsModal;

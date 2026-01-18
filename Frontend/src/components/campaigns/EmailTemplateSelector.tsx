import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { FileText, Search, Check } from 'lucide-react';
import { authenticatedFetch } from '@/utils/auth';
import { API_ENDPOINTS } from '@/config/api';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  tokens_used: string[];
}

interface EmailTemplateSelectorProps {
  onSelectTemplate: (template: EmailTemplate) => void;
  disabled?: boolean;
}

export const EmailTemplateSelector: React.FC<EmailTemplateSelectorProps> = ({
  onSelectTemplate,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Fetch system templates
  const { data: templates, isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const response = await authenticatedFetch(`${API_ENDPOINTS.EMAIL_CAMPAIGNS}/templates`);
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }
      const data = await response.json();
      return data.data || [];
    },
    enabled: open,
  });

  // Get unique categories
  const categories = React.useMemo(() => {
    if (!templates) return [];
    const cats = [...new Set(templates.map((t) => t.category))];
    return ['all', ...cats];
  }, [templates]);

  // Filter templates
  const filteredTemplates = React.useMemo(() => {
    if (!templates) return [];

    return templates.filter((template) => {
      const matchesCategory =
        selectedCategory === 'all' || template.category === selectedCategory;
      const matchesSearch =
        searchQuery === '' ||
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.subject.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [templates, selectedCategory, searchQuery]);

  const handleSelectTemplate = (template: EmailTemplate) => {
    onSelectTemplate(template);
    setOpen(false);
    setSearchQuery('');
    setSelectedCategory('all');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-1"
        >
          <FileText className="h-3 w-3" />
          Use Template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Email Templates</DialogTitle>
          <DialogDescription>
            Choose a pre-built template to personalize for your campaign
          </DialogDescription>
        </DialogHeader>

        {/* Search and Filter */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((category) => (
              <Badge
                key={category}
                variant={selectedCategory === category ? 'default' : 'outline'}
                className="cursor-pointer whitespace-nowrap capitalize"
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </Badge>
            ))}
          </div>
        </div>

        {/* Templates Grid */}
        <ScrollArea className="h-[500px] pr-4">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              Loading templates...
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              No templates found
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className="group cursor-pointer rounded-lg border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
                  onClick={() => handleSelectTemplate(template)}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-card-foreground">
                        {template.name}
                      </h4>
                      <p className="mt-1 text-sm text-muted-foreground">
                        <strong>Subject:</strong> {template.subject}
                      </p>
                    </div>
                    <Badge variant="secondary" className="ml-2 capitalize">
                      {template.category}
                    </Badge>
                  </div>

                  <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                    {template.body.replace(/<[^>]*>/g, '').substring(0, 150)}...
                  </p>

                  {/* Tokens Used */}
                  {template.tokens_used && template.tokens_used.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {template.tokens_used.map((token) => (
                        <Badge
                          key={token}
                          variant="outline"
                          className="font-mono text-[10px]"
                        >
                          {`{${token}}`}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Hover indicator */}
                  <div className="mt-3 flex items-center gap-2 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    <Check className="h-4 w-4" />
                    Click to use this template
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default EmailTemplateSelector;

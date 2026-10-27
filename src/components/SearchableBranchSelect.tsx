import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Building2, Search, X, Check, ChevronDown, Plus, MapPin } from 'lucide-react';
import { Branch } from '../types';

interface SearchableBranchSelectProps {
  value: string;
  branchCode?: string;
  branches: Branch[];
  onChange: (branchName: string, branchCode: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export const SearchableBranchSelect: React.FC<SearchableBranchSelectProps> = ({
  value,
  branchCode,
  branches,
  onChange,
  placeholder = 'Search or select branch...',
  disabled = false,
  required = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setHighlightedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Find currently selected branch object
  const currentBranch = useMemo(() => {
    return branches.find(b => b.name.toLowerCase() === (value || '').toLowerCase());
  }, [branches, value]);

  // Filter branches based on query (name, code, or address)
  const filteredBranches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return [...branches].sort((a, b) => a.name.localeCompare(b.name));
    }
    return branches
      .filter(b => {
        const nameMatch = b.name.toLowerCase().includes(q);
        const codeMatch = b.branchCode.toLowerCase().includes(q);
        const addressMatch = b.address ? b.address.toLowerCase().includes(q) : false;
        return nameMatch || codeMatch || addressMatch;
      })
      .sort((a, b) => {
        // Prioritize exact prefix match
        const aStarts = a.name.toLowerCase().startsWith(q) || a.branchCode.toLowerCase().startsWith(q);
        const bStarts = b.name.toLowerCase().startsWith(q) || b.branchCode.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [branches, searchQuery]);

  // Reset highlighted index on query change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, filteredBranches.length - 1));
      // Scroll into view
      scrollHighlightedIntoView(highlightedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
      scrollHighlightedIntoView(highlightedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredBranches.length > 0 && highlightedIndex >= 0 && highlightedIndex < filteredBranches.length) {
        const selected = filteredBranches[highlightedIndex];
        handleSelectBranch(selected.name, selected.branchCode);
      } else if (searchQuery.trim()) {
        handleSelectBranch(searchQuery.trim(), '');
      }
    }
  };

  const scrollHighlightedIntoView = (index: number) => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-branch-item]');
    if (items[index]) {
      items[index].scrollIntoView({ block: 'nearest' });
    }
  };

  const handleSelectBranch = (selectedName: string, selectedCode: string) => {
    onChange(selectedName, selectedCode);
    setIsOpen(false);
  };

  const displayCode = branchCode || currentBranch?.branchCode || '';

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full rounded-xl border text-left px-3 py-2 text-slate-800 bg-white font-medium flex items-center justify-between gap-2 transition cursor-pointer ${
          isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-500/20'
            : 'border-slate-300 hover:border-slate-400'
        } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-100' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
          {value ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="truncate text-sm font-semibold text-slate-900">{value}</span>
              {displayCode && (
                <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded shrink-0">
                  #{displayCode}
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm text-slate-400">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
          <Search className="w-3.5 h-3.5 hover:text-indigo-600 transition" />
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-600' : ''}`} />
        </div>
      </button>

      {/* Hidden input to support HTML form validation if required */}
      {required && (
        <input
          tabIndex={-1}
          autoComplete="off"
          style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
          value={value}
          onChange={() => {}}
          required={required}
        />
      )}

      {/* Searchable Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 animate-scale-in">
          {/* Search Header */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/70">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search branch name, code, or city..."
                className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800 placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Match Counter Badge */}
            <div className="flex items-center justify-between mt-1.5 px-1 text-[10px] text-slate-500">
              <span>
                {filteredBranches.length} {filteredBranches.length === 1 ? 'branch' : 'branches'} available
              </span>
              {searchQuery && (
                <span className="text-indigo-600 font-medium">Filtering by &quot;{searchQuery}&quot;</span>
              )}
            </div>
          </div>

          {/* Branch Options List */}
          <div ref={listRef} className="max-h-56 overflow-y-auto divide-y divide-slate-100 py-1" role="listbox">
            {filteredBranches.length > 0 ? (
              filteredBranches.map((b, idx) => {
                const isSelected = b.name.toLowerCase() === (value || '').toLowerCase();
                const isHighlighted = idx === highlightedIndex;

                return (
                  <button
                    key={b.id || `${b.name}-${idx}`}
                    data-branch-item
                    type="button"
                    onClick={() => handleSelectBranch(b.name, b.branchCode)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/80 text-indigo-950 font-semibold'
                        : isHighlighted
                          ? 'bg-slate-50 text-slate-900'
                          : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className={`mt-0.5 p-1 rounded-lg shrink-0 ${isSelected ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                        <Building2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold truncate">{b.name}</span>
                          <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded shrink-0">
                            #{b.branchCode}
                          </span>
                        </div>
                        {b.address && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{b.address}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-indigo-600 shrink-0 ml-2" />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center">
                <p className="text-xs text-slate-500">No branches match &quot;{searchQuery}&quot;</p>
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => handleSelectBranch(searchQuery.trim(), '')}
                    className="mt-2.5 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Use &quot;{searchQuery.trim()}&quot; as custom branch
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

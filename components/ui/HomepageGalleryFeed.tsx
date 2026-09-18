import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { DataTablePagination, SectionHeading } from './enterprise';
import {
    getDriveFileDisplayName,
    getIpoDriveImageUrl,
    HomepageGalleryFeedItem
} from '../../lib/googleDriveStorage';

const GALLERY_PAGE_SIZE = 6;

interface HomepageGalleryFeedProps {
    items: HomepageGalleryFeedItem[];
    isLoading: boolean;
    error?: string | null;
    onOpenItem: (item: HomepageGalleryFeedItem) => void;
}

const itemKey = (item: HomepageGalleryFeedItem) => `${item.entityType}-${item.entityId}`;

const getUploadYear = (uploadedAt?: string | null) => {
    if (!uploadedAt) return null;
    const date = new Date(uploadedAt);
    return Number.isNaN(date.getTime()) ? null : date.getFullYear();
};

export const HomepageGalleryFeed: React.FC<HomepageGalleryFeedProps> = ({ items, isLoading, error, onOpenItem }) => {
    const visibleItems = useMemo(
        () => items.filter(item => item.files.length > 0),
        [items]
    );
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [galleryPage, setGalleryPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(GALLERY_PAGE_SIZE);
    const [hideListThumbnails, setHideListThumbnails] = useState(() => (
        typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches
    ));
    const [failedImages, setFailedImages] = useState<Set<number>>(new Set());

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 760px)');
        const updateThumbnailVisibility = () => setHideListThumbnails(mediaQuery.matches);
        updateThumbnailVisibility();
        mediaQuery.addEventListener('change', updateThumbnailVisibility);
        return () => mediaQuery.removeEventListener('change', updateThumbnailVisibility);
    }, []);

    useEffect(() => {
        if (!visibleItems.length) {
            setSelectedKey(null);
            setCarouselIndex(0);
            setGalleryPage(1);
            return;
        }

        setGalleryPage(1);
        setSelectedKey(current => visibleItems.some(item => itemKey(item) === current) ? current : itemKey(visibleItems[0]));
    }, [visibleItems]);

    const totalPages = Math.max(1, Math.ceil(visibleItems.length / itemsPerPage));
    const paginatedItems = useMemo(
        () => visibleItems.slice((galleryPage - 1) * itemsPerPage, galleryPage * itemsPerPage),
        [galleryPage, itemsPerPage, visibleItems]
    );

    useEffect(() => {
        if (!paginatedItems.length) return;
        if (!paginatedItems.some(item => itemKey(item) === selectedKey)) {
            setSelectedKey(itemKey(paginatedItems[0]));
            setCarouselIndex(0);
        }
    }, [paginatedItems, selectedKey]);

    const selectedItem = paginatedItems.find(item => itemKey(item) === selectedKey)
        || visibleItems.find(item => itemKey(item) === selectedKey)
        || paginatedItems[0]
        || visibleItems[0];
    const selectedFiles = selectedItem?.files || [];
    const selectedFile = selectedFiles[carouselIndex] || selectedFiles[0];

    useEffect(() => {
        setCarouselIndex(current => selectedFiles.length ? Math.min(current, selectedFiles.length - 1) : 0);
    }, [selectedKey, selectedFiles.length]);

    const selectItem = (item: HomepageGalleryFeedItem) => {
        setSelectedKey(itemKey(item));
        setCarouselIndex(0);
    };

    const stepCarousel = (direction: -1 | 1) => {
        if (selectedFiles.length < 2) return;
        setCarouselIndex(current => (current + direction + selectedFiles.length) % selectedFiles.length);
    };

    const markImageFailed = (fileId: number) => {
        setFailedImages(current => new Set(current).add(fileId));
    };

    return (
        <div className="homepage-gallery-feed">
            <SectionHeading
                title="Gallery Feed"
            />

            {error && visibleItems.length > 0 && (
                <p className="homepage-gallery-feed__notice" role="status">Some gallery items could not be refreshed. Showing available images.</p>
            )}

            {isLoading && visibleItems.length === 0 ? (
                <div className="homepage-gallery-feed__empty" role="status">Loading gallery feed...</div>
            ) : visibleItems.length === 0 ? (
                <div className="homepage-gallery-feed__empty">
                    {error ? 'Gallery feed is temporarily unavailable.' : 'No gallery images have been uploaded yet.'}
                </div>
            ) : (
                <div className="homepage-gallery-feed__layout">
                    <section className="homepage-gallery-feed__viewer" aria-label="Selected gallery item">
                        <div className="homepage-gallery-feed__stage">
                            {selectedFile && !failedImages.has(selectedFile.id) ? (
                                <img
                                    src={getIpoDriveImageUrl(selectedFile, 1400)}
                                    alt={getDriveFileDisplayName(selectedFile)}
                                    onError={() => markImageFailed(selectedFile.id)}
                                />
                            ) : (
                                <div className="homepage-gallery-feed__fallback"><ImageIcon aria-hidden="true" /></div>
                            )}
                            {selectedFiles.length > 1 && (
                                <>
                                    <button
                                        type="button"
                                        className="homepage-gallery-feed__nav homepage-gallery-feed__nav--previous"
                                        onClick={() => stepCarousel(-1)}
                                        aria-label="Previous gallery image"
                                    >
                                        <ChevronLeft aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        className="homepage-gallery-feed__nav homepage-gallery-feed__nav--next"
                                        onClick={() => stepCarousel(1)}
                                        aria-label="Next gallery image"
                                    >
                                        <ChevronRight aria-hidden="true" />
                                    </button>
                                </>
                            )}
                            {selectedFile && (
                                <div className="homepage-gallery-feed__caption">
                                    <strong>{getDriveFileDisplayName(selectedFile)}</strong>
                                    <span>{carouselIndex + 1} of {selectedFiles.length}{selectedFile.caption ? ` · ${selectedFile.caption}` : ''}</span>
                                </div>
                            )}
                        </div>
                        {selectedFiles.length > 1 && (
                            <div className="homepage-gallery-feed__rail custom-scrollbar" aria-label="Gallery thumbnails">
                                {selectedFiles.map((file, index) => (
                                    <button
                                        type="button"
                                        key={file.id}
                                        className={index === carouselIndex ? 'is-active' : ''}
                                        onClick={() => setCarouselIndex(index)}
                                        aria-label={`Show ${getDriveFileDisplayName(file)}`}
                                        aria-current={index === carouselIndex}
                                    >
                                        {!failedImages.has(file.id) && (
                                            <img
                                                src={getIpoDriveImageUrl(file, 220)}
                                                alt=""
                                                loading="lazy"
                                                onError={() => markImageFailed(file.id)}
                                            />
                                        )}
                                        <ImageIcon aria-hidden="true" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="homepage-gallery-feed__list" aria-label="Items with gallery images">
                        {isLoading && (
                            <div className="homepage-gallery-feed__list-header">
                                <span role="status">Refreshing...</span>
                            </div>
                        )}
                        <div className="homepage-gallery-feed__list-scroll custom-scrollbar">
                            {paginatedItems.map(item => {
                                const isSelected = itemKey(item) === itemKey(selectedItem);
                                const firstFile = item.files[0];
                                return (
                                    <article key={itemKey(item)} className={`homepage-gallery-feed__item${isSelected ? ' is-selected' : ''}`}>
                                        {!hideListThumbnails && (
                                            <button
                                                type="button"
                                                className="homepage-gallery-feed__item-select"
                                                onClick={() => selectItem(item)}
                                                aria-pressed={isSelected}
                                                aria-label={`Preview gallery images for ${item.entityName}`}
                                            >
                                                <span className="homepage-gallery-feed__item-thumb">
                                                    {!failedImages.has(firstFile.id) && (
                                                        <img
                                                            src={getIpoDriveImageUrl(firstFile, 260)}
                                                            alt=""
                                                            loading="lazy"
                                                            onError={() => markImageFailed(firstFile.id)}
                                                        />
                                                    )}
                                                    <ImageIcon aria-hidden="true" />
                                                </span>
                                            </button>
                                        )}
                                        <div className="homepage-gallery-feed__item-copy">
                                            <button
                                                type="button"
                                                className="homepage-gallery-feed__item-name"
                                                onClick={() => onOpenItem(item)}
                                                title={`View ${item.entityName}`}
                                            >
                                                <span className="homepage-gallery-feed__item-name-label">{item.entityName}</span>
                                                <ExternalLink aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                className="homepage-gallery-feed__item-details"
                                                onClick={() => selectItem(item)}
                                                aria-label={`Select gallery images for ${item.entityName}`}
                                            >
                                                {item.entityType === 'ipo' ? (
                                                    <>
                                                        <span
                                                            className="homepage-gallery-feed__item-meta"
                                                            title={`IPO${item.region ? ` · ${item.region}` : ''}`}
                                                        >
                                                            IPO{item.region ? ` · ${item.region}` : ''}
                                                        </span>
                                                        {getUploadYear(firstFile.uploaded_at) && (
                                                            <time dateTime={firstFile.uploaded_at}>{getUploadYear(firstFile.uploaded_at)}</time>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <span
                                                            className="homepage-gallery-feed__item-meta"
                                                            title={`${item.entityType === 'subproject' ? 'Subproject' : 'Activity'} · ${item.files.length} image${item.files.length === 1 ? '' : 's'}${item.operatingUnit ? ` · ${item.operatingUnit}` : ''}`}
                                                        >
                                                            {item.entityType === 'subproject' ? 'Subproject' : 'Activity'} · {item.files.length} image{item.files.length === 1 ? '' : 's'}
                                                            {item.operatingUnit ? ` · ${item.operatingUnit}` : ''}
                                                        </span>
                                                        {item.activityDate && <time dateTime={item.activityDate}>{new Date(item.activityDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</time>}
                                                        {firstFile.caption && <span className="homepage-gallery-feed__item-caption" title={firstFile.caption}>{firstFile.caption}</span>}
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                        <DataTablePagination
                            className="homepage-gallery-feed__pagination"
                            aria-label="Gallery feed pagination"
                            currentPage={galleryPage}
                            totalPages={totalPages}
                            totalItems={visibleItems.length}
                            itemsPerPage={itemsPerPage}
                            compact
                            pageSizeOptions={[6, 10, 20, 50]}
                            onPageChange={setGalleryPage}
                            onItemsPerPageChange={size => {
                                setItemsPerPage(size);
                                setGalleryPage(1);
                            }}
                        />
                    </section>
                </div>
            )}
        </div>
    );
};

export default HomepageGalleryFeed;

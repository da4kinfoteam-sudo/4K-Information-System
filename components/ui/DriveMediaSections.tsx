import React, { DragEvent, useEffect, useRef, useState } from 'react';
import {
    Check,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Eye,
    FileText,
    Grid3X3,
    Image as ImageIcon,
    Images,
    List,
    Loader2,
    Pencil,
    RefreshCw,
    Trash2,
    UploadCloud,
    X
} from 'lucide-react';
import {
    DRIVE_GALLERY_IMAGE_ACCEPT,
    DriveMediaFile,
    DriveUploadSection,
    formatFileSize,
    getDriveFileDisplayName,
    IPO_DRIVE_FILE_ACCEPT,
    isAllowedDriveGalleryImage,
    isAllowedIpoDriveFile
} from '../../lib/googleDriveStorage';

type GalleryView = 'thumbnail' | 'list' | 'carousel';
type UploadStatus = 'queued' | 'uploading' | 'completed' | 'failed';

interface UploadQueueItem {
    id: string;
    file: File;
    status: UploadStatus;
    error?: string;
}

interface DriveUploadDropzoneProps<TFile extends DriveMediaFile> {
    section: DriveUploadSection;
    canUpload: boolean;
    isConnected: boolean;
    uploadFile: (file: File, section: DriveUploadSection) => Promise<TFile>;
    onUploaded: (file: TFile) => void;
    onBatchComplete?: (message: string, hasErrors: boolean) => void;
}

const fileFingerprint = (file: File) => `${file.name.toLowerCase()}::${file.size}::${file.lastModified}`;

const getSafeUploadErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || '');
    if (/duplicate key|unique constraint|sqlstate|postgres|postgrest|pgrst\d*/i.test(message)) {
        return 'The upload folder could not be prepared. Refresh the section and try again.';
    }
    return message || 'Upload failed.';
};

const formatUploadedAt = (value?: string | null) => {
    if (!value) return 'Unknown date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export function DriveUploadDropzone<TFile extends DriveMediaFile>({
    section,
    canUpload,
    isConnected,
    uploadFile,
    onUploaded,
    onBatchComplete
}: DriveUploadDropzoneProps<TFile>) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [queue, setQueue] = useState<UploadQueueItem[]>([]);
    const [summary, setSummary] = useState<{ message: string; hasErrors: boolean } | null>(null);
    const isGallery = section === 'gallery';
    const disabled = !canUpload || !isConnected || isUploading;

    const updateQueueItem = (id: string, patch: Partial<UploadQueueItem>) => {
        setQueue(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
    };

    const processFiles = async (selectedFiles: File[]) => {
        if (disabled || selectedFiles.length === 0) return;
        setSummary(null);

        const unique = new Map<string, File>();
        const invalidItems: UploadQueueItem[] = [];
        selectedFiles.forEach((file, index) => {
            const fingerprint = fileFingerprint(file);
            const id = `${fingerprint}::${index}::${Date.now()}`;
            if (unique.has(fingerprint)) {
                invalidItems.push({ id, file, status: 'failed', error: 'Duplicate ignored in this upload batch.' });
                return;
            }
            unique.set(fingerprint, file);
            const valid = isGallery ? isAllowedDriveGalleryImage(file) : isAllowedIpoDriveFile(file);
            if (!valid) {
                invalidItems.push({
                    id,
                    file,
                    status: 'failed',
                    error: isGallery ? 'Gallery accepts image files only.' : 'Only PDF and supported image files are allowed.'
                });
            }
        });

        const validFiles = Array.from(unique.values()).filter(file =>
            isGallery ? isAllowedDriveGalleryImage(file) : isAllowedIpoDriveFile(file)
        );
        const queuedItems = validFiles.map((file, index) => ({
            id: `${fileFingerprint(file)}::valid::${index}::${Date.now()}`,
            file,
            status: 'queued' as UploadStatus
        }));
        setQueue([...queuedItems, ...invalidItems]);

        if (queuedItems.length === 0) {
            const message = `No files uploaded. ${invalidItems.length} file${invalidItems.length === 1 ? '' : 's'} could not be added.`;
            setSummary({ message, hasErrors: true });
            onBatchComplete?.(message, true);
            return;
        }

        setIsUploading(true);
        let cursor = 0;
        let completed = 0;
        let failed = invalidItems.length;

        const uploadQueueItem = async (item: UploadQueueItem) => {
            updateQueueItem(item.id, { status: 'uploading', error: undefined });
            try {
                const uploaded = await uploadFile(item.file, section);
                onUploaded(uploaded);
                completed += 1;
                updateQueueItem(item.id, { status: 'completed' });
                return true;
            } catch (error) {
                failed += 1;
                updateQueueItem(item.id, { status: 'failed', error: getSafeUploadErrorMessage(error) });
                return false;
            }
        };

        // Establish the entity and Gallery/Files hierarchy with one successful
        // request before allowing the remaining binary uploads to run together.
        let firstSuccessfulIndex = -1;
        for (let index = 0; index < queuedItems.length; index += 1) {
            if (await uploadQueueItem(queuedItems[index])) {
                firstSuccessfulIndex = index;
                break;
            }
        }

        const remainingItems = firstSuccessfulIndex >= 0
            ? queuedItems.slice(firstSuccessfulIndex + 1)
            : [];

        const worker = async () => {
            while (cursor < remainingItems.length) {
                const item = remainingItems[cursor++];
                await uploadQueueItem(item);
            }
        };

        await Promise.all(Array.from({ length: Math.min(2, remainingItems.length) }, () => worker()));
        setIsUploading(false);
        const result = `${completed} file${completed === 1 ? '' : 's'} uploaded${failed ? `; ${failed} failed or skipped` : ''}.`;
        setSummary({ message: result, hasErrors: failed > 0 });
        onBatchComplete?.(result, failed > 0);
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragging(false);
        if (!disabled) void processFiles(Array.from(event.dataTransfer.files));
    };

    return (
        <div className="drive-upload-panel">
            <div
                className={`drive-upload-dropzone${isDragging ? ' drive-upload-dropzone--active' : ''}${disabled ? ' drive-upload-dropzone--disabled' : ''}`}
                onDragEnter={event => { event.preventDefault(); if (!disabled) setIsDragging(true); }}
                onDragOver={event => event.preventDefault()}
                onDragLeave={event => {
                    const relatedTarget = event.relatedTarget;
                    if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) setIsDragging(false);
                }}
                onDrop={handleDrop}
            >
                <UploadCloud aria-hidden="true" />
                <div>
                    <strong>{isGallery ? 'Add gallery images' : 'Add files'}</strong>
                    <span>{isConnected ? 'Drag files here or browse from your device.' : 'Google Drive must be connected before uploading.'}</span>
                </div>
                <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()} disabled={disabled}>
                    {isUploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}
                    {isUploading ? 'Uploading' : 'Browse'}
                </button>
                <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept={isGallery ? DRIVE_GALLERY_IMAGE_ACCEPT : IPO_DRIVE_FILE_ACCEPT}
                    disabled={disabled}
                    onChange={event => {
                        const files = Array.from(event.currentTarget.files ?? []) as File[];
                        event.currentTarget.value = '';
                        void processFiles(files);
                    }}
                />
            </div>
            {queue.length > 0 && (
                <div className="drive-upload-queue" aria-live="polite">
                    <div className="drive-upload-queue__header">
                        <span>Upload queue</span>
                        {!isUploading && (
                            <button type="button" className="table-action" onClick={() => setQueue([])}>Clear</button>
                        )}
                    </div>
                    {queue.map(item => (
                        <div key={item.id} className={`drive-upload-queue__item drive-upload-queue__item--${item.status}`}>
                            {item.status === 'uploading' && <Loader2 className="animate-spin" aria-hidden="true" />}
                            {item.status === 'completed' && <Check aria-hidden="true" />}
                            {item.status === 'failed' && <X aria-hidden="true" />}
                            {item.status === 'queued' && <FileText aria-hidden="true" />}
                            <div>
                                <strong>{item.file.name}</strong>
                                <span>{item.error || item.status}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {summary && (
                <p className={`drive-upload-summary${summary.hasErrors ? ' drive-upload-summary--warning' : ''}`} role="status">
                    {summary.message}
                </p>
            )}
        </div>
    );
}

interface EntityGalleryProps<TFile extends DriveMediaFile> {
    storageKey: string;
    files: TFile[];
    isLoading: boolean;
    canEdit: boolean;
    canDelete: boolean;
    isConnected: boolean;
    getImageUrl: (file: TFile, size?: number) => string;
    uploadFile: (file: File, section: DriveUploadSection) => Promise<TFile>;
    updateMetadata: (file: TFile, displayName: string, caption: string) => Promise<TFile>;
    onFileAdded: (file: TFile) => void;
    onFileUpdated: (file: TFile) => void;
    onRequestDelete: (file: TFile) => void;
    onRefresh: () => void;
    onMessage?: (message: string, hasErrors: boolean) => void;
}

export function EntityGallery<TFile extends DriveMediaFile>({
    storageKey,
    files,
    isLoading,
    canEdit,
    canDelete,
    isConnected,
    getImageUrl,
    uploadFile,
    updateMetadata,
    onFileAdded,
    onFileUpdated,
    onRequestDelete,
    onRefresh,
    onMessage
}: EntityGalleryProps<TFile>) {
    const [view, setView] = useState<GalleryView>(() => {
        const saved = window.localStorage.getItem(`4kis-gallery-view:${storageKey}`);
        return saved === 'list' || saved === 'carousel' ? saved : 'thumbnail';
    });
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const [editingFile, setEditingFile] = useState<TFile | null>(null);
    const [displayName, setDisplayName] = useState('');
    const [caption, setCaption] = useState('');
    const [isSavingMetadata, setIsSavingMetadata] = useState(false);
    const [metadataError, setMetadataError] = useState<string | null>(null);
    const [imageFailures, setImageFailures] = useState<Set<number>>(new Set());

    useEffect(() => {
        window.localStorage.setItem(`4kis-gallery-view:${storageKey}`, view);
    }, [storageKey, view]);

    useEffect(() => {
        if (carouselIndex >= files.length) setCarouselIndex(Math.max(0, files.length - 1));
        if (previewIndex !== null && previewIndex >= files.length) setPreviewIndex(files.length ? files.length - 1 : null);
    }, [carouselIndex, files.length, previewIndex]);

    const beginEdit = (file: TFile) => {
        setEditingFile(file);
        setDisplayName(getDriveFileDisplayName(file));
        setCaption(file.caption || '');
        setMetadataError(null);
    };

    const saveMetadata = async () => {
        if (!editingFile) return;
        setIsSavingMetadata(true);
        setMetadataError(null);
        try {
            const updated = await updateMetadata(editingFile, displayName, caption);
            onFileUpdated(updated);
            setEditingFile(null);
            onMessage?.('Gallery image details updated.', false);
        } catch (error: any) {
            const message = error?.message || 'Unable to update Gallery image details.';
            setMetadataError(message);
            onMessage?.(message, true);
        } finally {
            setIsSavingMetadata(false);
        }
    };

    const previous = (index: number) => files.length ? (index - 1 + files.length) % files.length : 0;
    const next = (index: number) => files.length ? (index + 1) % files.length : 0;
    const carouselFile = files[carouselIndex];
    const previewFile = previewIndex === null ? null : files[previewIndex];

    const actions = (file: TFile) => (
        <div className="drive-gallery-actions">
            {canEdit && (
                <button type="button" className="table-action table-action--primary" onClick={event => { event.stopPropagation(); beginEdit(file); }} title="Edit image name and caption">
                    <Pencil aria-hidden="true" />
                    <span>Edit</span>
                </button>
            )}
            {canDelete && (
                <button type="button" className="table-action table-action--danger" onClick={event => { event.stopPropagation(); onRequestDelete(file); }} title="Delete image">
                    <Trash2 aria-hidden="true" />
                    <span>Delete</span>
                </button>
            )}
        </div>
    );

    return (
        <div className="drive-media-section">
            <div className="drive-media-toolbar">
                <div className="drive-gallery-view-toggle" role="group" aria-label="Gallery view">
                    <button type="button" className={view === 'thumbnail' ? 'is-active' : ''} onClick={() => setView('thumbnail')} title="Thumbnail view" aria-label="Thumbnail view"><Grid3X3 aria-hidden="true" /></button>
                    <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')} title="List view" aria-label="List view"><List aria-hidden="true" /></button>
                    <button type="button" className={view === 'carousel' ? 'is-active' : ''} onClick={() => setView('carousel')} title="Carousel view" aria-label="Carousel view"><Images aria-hidden="true" /></button>
                </div>
                <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={isLoading}>
                    <RefreshCw className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
                    Refresh
                </button>
            </div>

            {canEdit && (
                <DriveUploadDropzone
                    section="gallery"
                    canUpload={canEdit}
                    isConnected={isConnected}
                    uploadFile={uploadFile}
                    onUploaded={onFileAdded}
                    onBatchComplete={onMessage}
                />
            )}

            {isLoading ? (
                <div className="drive-file-card__loading"><Loader2 className="animate-spin" aria-hidden="true" /><span>Loading Gallery...</span></div>
            ) : files.length === 0 ? (
                <p className="detail-empty">No Gallery images have been uploaded yet.</p>
            ) : (
                <div className="drive-media-scroll custom-scrollbar">
                    {view === 'thumbnail' && (
                        <div className="drive-gallery-grid">
                            {files.map((file, index) => (
                                <article key={file.id} className="drive-gallery-tile">
                                    <button type="button" className="drive-gallery-tile__preview" onClick={() => setPreviewIndex(index)} title={`Preview ${getDriveFileDisplayName(file)}`}>
                                        {!imageFailures.has(file.id) && <img src={getImageUrl(file, 520)} alt={getDriveFileDisplayName(file)} loading="lazy" onError={() => setImageFailures(current => new Set(current).add(file.id))} />}
                                        <span className="drive-gallery-tile__fallback"><ImageIcon aria-hidden="true" /></span>
                                    </button>
                                    <div className="drive-gallery-tile__details">
                                        <strong>{getDriveFileDisplayName(file)}</strong>
                                        {file.caption && <p>{file.caption}</p>}
                                        {actions(file)}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                    {view === 'list' && (
                        <div className="drive-gallery-list">
                            {files.map((file, index) => (
                                <article key={file.id} className="drive-gallery-list__item">
                                    <button type="button" className="drive-gallery-list__thumb" onClick={() => setPreviewIndex(index)} aria-label={`Preview ${getDriveFileDisplayName(file)}`}>
                                        {!imageFailures.has(file.id) && <img src={getImageUrl(file, 240)} alt="" loading="lazy" onError={() => setImageFailures(current => new Set(current).add(file.id))} />}
                                        <ImageIcon aria-hidden="true" />
                                    </button>
                                    <div className="drive-gallery-list__copy">
                                        <strong>{getDriveFileDisplayName(file)}</strong>
                                        {file.caption && <p>{file.caption}</p>}
                                        <span>{formatFileSize(file.file_size)} · {file.uploaded_by_name || 'Unknown user'} · {formatUploadedAt(file.uploaded_at)}</span>
                                    </div>
                                    {actions(file)}
                                </article>
                            ))}
                        </div>
                    )}
                    {view === 'carousel' && carouselFile && (
                        <div className="drive-gallery-carousel">
                            <div className="drive-gallery-carousel__stage">
                                <button type="button" className="drive-gallery-carousel__nav" onClick={() => setCarouselIndex(previous(carouselIndex))} aria-label="Previous image"><ChevronLeft aria-hidden="true" /></button>
                                <button type="button" className="drive-gallery-carousel__image" onClick={() => setPreviewIndex(carouselIndex)}>
                                    {!imageFailures.has(carouselFile.id) ? (
                                        <img src={getImageUrl(carouselFile, 1200)} alt={getDriveFileDisplayName(carouselFile)} onError={() => setImageFailures(current => new Set(current).add(carouselFile.id))} />
                                    ) : <ImageIcon aria-hidden="true" />}
                                </button>
                                <button type="button" className="drive-gallery-carousel__nav" onClick={() => setCarouselIndex(next(carouselIndex))} aria-label="Next image"><ChevronRight aria-hidden="true" /></button>
                            </div>
                            <div className="drive-gallery-carousel__details">
                                <span>{carouselIndex + 1} of {files.length}</span>
                                <strong>{getDriveFileDisplayName(carouselFile)}</strong>
                                {carouselFile.caption && <p>{carouselFile.caption}</p>}
                                {actions(carouselFile)}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {previewFile && previewIndex !== null && (
                <div className="dashboard-modal-backdrop" onClick={() => setPreviewIndex(null)}>
                    <div className="dashboard-modal dashboard-modal--wide drive-gallery-preview" onClick={event => event.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <div>
                                <h3>{getDriveFileDisplayName(previewFile)}</h3>
                                <p className="dashboard-modal__metric-subtext">{previewIndex + 1} of {files.length}</p>
                            </div>
                            <button type="button" className="dashboard-modal__close" onClick={() => setPreviewIndex(null)} aria-label="Close Gallery preview"><X aria-hidden="true" /></button>
                        </div>
                        <div className="drive-gallery-preview__body">
                            <button type="button" className="drive-gallery-preview__nav" onClick={() => setPreviewIndex(previous(previewIndex))} aria-label="Previous image"><ChevronLeft aria-hidden="true" /></button>
                            {!imageFailures.has(previewFile.id) ? (
                                <img src={getImageUrl(previewFile, 1800)} alt={getDriveFileDisplayName(previewFile)} onError={() => setImageFailures(current => new Set(current).add(previewFile.id))} />
                            ) : (
                                <div className="drive-preview-modal__empty"><ImageIcon aria-hidden="true" /><p>Image preview is not available.</p></div>
                            )}
                            <button type="button" className="drive-gallery-preview__nav" onClick={() => setPreviewIndex(next(previewIndex))} aria-label="Next image"><ChevronRight aria-hidden="true" /></button>
                        </div>
                        {(previewFile.caption || previewFile.web_view_link) && (
                            <div className="drive-gallery-preview__footer">
                                {previewFile.caption && <p>{previewFile.caption}</p>}
                                {previewFile.web_view_link && <a className="btn btn-secondary" href={previewFile.web_view_link} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Open in Drive</a>}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {editingFile && (
                <div className="dashboard-modal-backdrop" onClick={() => !isSavingMetadata && setEditingFile(null)}>
                    <div className="dashboard-modal dashboard-modal--compact" onClick={event => event.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <div><h3>Edit Gallery Image</h3><p className="dashboard-modal__metric-subtext">The original Google Drive filename is preserved.</p></div>
                            <button type="button" className="dashboard-modal__close" onClick={() => setEditingFile(null)} disabled={isSavingMetadata} aria-label="Close editor"><X aria-hidden="true" /></button>
                        </div>
                        <div className="dashboard-modal__body drive-gallery-metadata-form">
                            {metadataError && <p className="drive-file-card__message" role="alert">{metadataError}</p>}
                            <label><span>Display name</span><input type="text" value={displayName} maxLength={255} onChange={event => setDisplayName(event.target.value)} /></label>
                            <label><span>Caption</span><textarea value={caption} maxLength={4000} rows={5} onChange={event => setCaption(event.target.value)} /></label>
                        </div>
                        <div className="dashboard-modal__actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setEditingFile(null)} disabled={isSavingMetadata}>Cancel</button>
                            <button type="button" className="btn btn-primary" onClick={() => void saveMetadata()} disabled={isSavingMetadata}>
                                {isSavingMetadata && <Loader2 className="animate-spin" aria-hidden="true" />}Save Details
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

interface EntityFilesListProps<TFile extends DriveMediaFile> {
    files: TFile[];
    isLoading: boolean;
    canEdit: boolean;
    canDelete: boolean;
    isConnected: boolean;
    uploadFile: (file: File, section: DriveUploadSection) => Promise<TFile>;
    onFileAdded: (file: TFile) => void;
    onRequestDelete: (file: TFile) => void;
    onRefresh: () => void;
    getFolderPath?: (file: TFile) => string;
    onMessage?: (message: string, hasErrors: boolean) => void;
}

export function EntityFilesList<TFile extends DriveMediaFile>({
    files,
    isLoading,
    canEdit,
    canDelete,
    isConnected,
    uploadFile,
    onFileAdded,
    onRequestDelete,
    onRefresh,
    getFolderPath,
    onMessage
}: EntityFilesListProps<TFile>) {
    const [previewFile, setPreviewFile] = useState<TFile | null>(null);
    const previewUrl = previewFile?.preview_url || (previewFile ? `https://drive.google.com/file/d/${encodeURIComponent(previewFile.file_id)}/preview` : '');

    return (
        <div className="drive-media-section">
            <div className="drive-media-toolbar drive-media-toolbar--files">
                <p>PDF and image documentation uploaded here remains separate from the Gallery.</p>
                <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={isLoading}><RefreshCw className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />Refresh</button>
            </div>
            {canEdit && (
                <DriveUploadDropzone
                    section="files"
                    canUpload={canEdit}
                    isConnected={isConnected}
                    uploadFile={uploadFile}
                    onUploaded={onFileAdded}
                    onBatchComplete={onMessage}
                />
            )}
            {isLoading ? (
                <div className="drive-file-card__loading"><Loader2 className="animate-spin" aria-hidden="true" /><span>Loading files...</span></div>
            ) : files.length === 0 ? (
                <p className="detail-empty">No files have been uploaded yet.</p>
            ) : (
                <div className="drive-media-scroll custom-scrollbar">
                    <ul className="detail-list drive-files-list">
                        {files.map(file => (
                            <li key={file.id} className="detail-list-item drive-file-card__item">
                                <div className="drive-file-card__file">
                                    <FileText aria-hidden="true" />
                                    <div className="min-w-0">
                                        <p className="detail-list-title">{getDriveFileDisplayName(file)}</p>
                                        <p className="detail-list-copy">{formatFileSize(file.file_size)} · {file.uploaded_by_name || 'Unknown user'} · {formatUploadedAt(file.uploaded_at)}</p>
                                        {getFolderPath && <p className="detail-list-copy">{getFolderPath(file)} / Files</p>}
                                    </div>
                                </div>
                                <div className="drive-file-card__actions">
                                    {file.preview_supported !== false && (
                                        <button type="button" className="table-action table-action--primary" onClick={() => setPreviewFile(file)}><Eye aria-hidden="true" />Preview</button>
                                    )}
                                    {file.web_view_link && <a className="table-action table-action--primary" href={file.web_view_link} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Open</a>}
                                    {canDelete && <button type="button" className="table-action table-action--danger" onClick={() => onRequestDelete(file)}><Trash2 aria-hidden="true" />Delete</button>}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {previewFile && (
                <div className="dashboard-modal-backdrop" onClick={() => setPreviewFile(null)}>
                    <div className="dashboard-modal dashboard-modal--wide drive-preview-modal" onClick={event => event.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <div><h3>{getDriveFileDisplayName(previewFile)}</h3><p className="dashboard-modal__metric-subtext">{formatFileSize(previewFile.file_size)} · {previewFile.mime_type || 'File preview'}</p></div>
                            <button type="button" className="dashboard-modal__close" onClick={() => setPreviewFile(null)} aria-label="Close file preview"><X aria-hidden="true" /></button>
                        </div>
                        <div className="drive-preview-modal__body"><iframe src={previewUrl} title={`Preview ${getDriveFileDisplayName(previewFile)}`} className="drive-preview-modal__frame" allow="autoplay" /></div>
                        <div className="drive-preview-modal__footer">
                            <p>If the preview does not load, open the file directly in Google Drive.</p>
                            {previewFile.web_view_link && <a className="btn btn-secondary" href={previewFile.web_view_link} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Open in Drive</a>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export const getPersistedDriveUploadSection = (file: Pick<DriveMediaFile, 'upload_section' | 'mime_type' | 'file_name'>): DriveUploadSection => {
    if (file.upload_section === 'gallery' || file.upload_section === 'files') return file.upload_section;
    const mimeType = file.mime_type?.toLowerCase() || '';
    return mimeType.startsWith('image/') || /\.(gif|jpe?g|png|webp)$/i.test(file.file_name) ? 'gallery' : 'files';
};

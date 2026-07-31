interface ProfileTheme {
  bannerColor1?: string;
  bannerColor2?: string;
  backgroundColor1?: string;
  backgroundColor2?: string;
  accentColor?: string;
  usernameColor?: string;
  bannerStyle?: 'diagonal' | 'radial' | 'solid' | 'split';
  backgroundStyle?: 'gradient' | 'spotlight' | 'solid';
  bannerAngle?: number;
  avatarShape?: 'circle' | 'rounded' | 'square';
  avatarRing?: 'subtle' | 'bold' | 'double';
  usernameEffect?: 'none' | 'gradient' | 'glow' | 'shadow';
}

interface UserFields {
  username?: string;
  photoURL?: string;
  bannerURL?: string;
  photoPublicId?: string;
  bannerPublicId?: string;
  badges?: string[];
  profileTheme?: ProfileTheme | string | null;

  privacySettings?: {
    showEmail?: boolean;
    showFriendsList?: boolean;
    showModsList?: boolean;
    modsVisibility?: 'global' | 'public' | 'friends' | 'private';
    allowSync?: boolean;
  };
}

interface ProfileBadgeMeta {
  label: string;
  icon: string;
  className: string;
  imageUrl?: string;
  imageAlt?: string;
  color?: string;
  background?: string;
  borderColor?: string;
}

interface ProfileBadgeDefinition {
  id?: string;
  label?: string;
  icon?: string;
  className?: string;
  imageUrl?: string;
  image_url?: string;
  imageAlt?: string;
  image_alt?: string;
  color?: string;
  background?: string;
  borderColor?: string;
}

interface GameBananaTopSubmission {
  _idRow: number;
  _sModelName?: string;
  _sSingularTitle?: string;
  _sName?: string;
  _sProfileUrl?: string;
  _sImageUrl?: string;
  _sThumbnailUrl?: string;
  _sInitialVisibility?: string;
  _sText?: string;
  _sDescription?: string;
  _aRequirements?: [string, string][];
  _bHasContentRatings?: boolean;
  _bIsNsfw?: boolean;
  _bIsNSFW?: boolean;
  _bIsAdult?: boolean;
  _sContentRating?: string;
  _aContentRatings?: any[];
  _aContentRating?: any[];
  _aTags?: any[];
  _aFiles?: GameBananaFileEntry[];
  _sPeriod?: string;
  _tsDateAdded?: number;
  _nLikeCount?: number;
  _nPostCount?: number;
  _nViewCount?: number;
  _nDownloadCount?: number;
  _aPreviewMedia?: {
    _aMetadata?: {
      _sSnippet?: string;
      _sAudioUrl?: string;
    };
    _aImages?: {
      _sCaption?: string;
      _sBaseUrl?: string;
      _sFile?: string;
      _wFile?: number;
      _hFile?: number;
      _sFile100?: string;
      _wFile100?: number;
      _hFile100?: number;
      _sFile220?: string;
      _wFile220?: number;
      _hFile220?: number;
      _sFile530?: string;
      _wFile530?: number;
      _hFile530?: number;
      _sFile800?: string;
      _wFile800?: number;
      _hFile800?: number;
    }[];
  };
  _aSubmitter?: {
    _sName?: string;
    _sProfileUrl?: string;
    _sAvatarUrl?: string;
  };
  _aRootCategory?: {
    _sName?: string;
    _sProfileUrl?: string;
    _sIconUrl?: string;
  };
  _aSubCategory?: {
    _sName?: string;
    _sProfileUrl?: string;
    _sIconUrl?: string;
  };
}

type GameBananaDiscoverSort = 'recent' | 'popularity' | 'downloads';

interface GameBananaSubfeedResponse {
  _aMetadata?: {
    _nRecordCount?: number;
    _nPerpage?: number;
    _bIsComplete?: boolean;
  };
  _aRecords?: GameBananaTopSubmission[];
}

interface GameBananaFileEntry {
  _idRow?: number;
  _sFile?: string;
  _nFilesize?: number;
  _tsDateAdded?: number;
  _nDownloadCount?: number;
  _sDownloadUrl?: string;
  _sDescription?: string;
  _sAnalysisResult?: string;
  _sAvResult?: string;
  _sFightPlannerDownloadUrl?: string;
}

interface PendingGameBananaSocialDownload {
  link: string;
  downloadId: string;
  modId: string;
  modName: string;
  creator: string;
  imageUrl: string;
  availableFiles: {
    id: number | string;
    name: string;
    description: string;
    size: number;
    downloads: number;
  }[];
}

type ProfileMediaType = 'avatar' | 'banner';

interface ProfileMediaCropState {
  type: ProfileMediaType;
  file: File;
  objectUrl: string;
  image: HTMLImageElement;
  zoom: number;
  offsetX: number;
  offsetY: number;
  dragging: boolean;
  lastX: number;
  lastY: number;
}

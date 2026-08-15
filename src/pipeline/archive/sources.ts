// oxlint-disable-next-line sonarjs/no-clear-text-protocols -- the AMND file host serves no TLS; this is a fixed historical source URL, only ever used via the Wayback Machine mirror below.
const ARCHIVE_BASE_URL = 'http://amnd.sa.netball.com.au/files/40002/files/';

export interface ArchivePdfSource {
    year: number;
    sourceFilename: string;
    rawFilename: string;
    originalUrl: string;
    waybackTimestamp: string | null;
    waybackUrl: string;
}

interface SourceDefinition {
    year: number;
    sourceFilename: string;
    waybackTimestamp: string | null;
}

const DEFINITIONS: readonly SourceDefinition[] = [
    {
        sourceFilename: '2000 Final Placings.pdf',
        waybackTimestamp: null,
        year: 2000,
    },
    {
        sourceFilename: '2001 Final Placings.pdf',
        waybackTimestamp: '20150505141406',
        year: 2001,
    },
    {
        sourceFilename: '2002 Final Placings.pdf',
        waybackTimestamp: '20150505141412',
        year: 2002,
    },
    {
        sourceFilename: '2003 Final Placings.pdf',
        waybackTimestamp: null,
        year: 2003,
    },
    {
        sourceFilename: '2004 Final Placings.pdf',
        waybackTimestamp: null,
        year: 2004,
    },
    {
        sourceFilename: '2005 Final Placings.pdf',
        waybackTimestamp: '20150505141426',
        year: 2005,
    },
    {
        sourceFilename: '2006 AMND Final Placings.pdf',
        waybackTimestamp: '20150505141432',
        year: 2006,
    },
    {
        sourceFilename: '2007 AMND Final Placings.pdf',
        waybackTimestamp: null,
        year: 2007,
    },
    {
        sourceFilename: '2008 AMND Final Premiership Placings.pdf',
        waybackTimestamp: null,
        year: 2008,
    },
    {
        sourceFilename: '2009 AMND Final Premiership Placings.pdf',
        waybackTimestamp: null,
        year: 2009,
    },
    {
        sourceFilename: '2010 Final Premiership Placings.pdf',
        waybackTimestamp: null,
        year: 2010,
    },
    {
        sourceFilename: '2011 AMND Final Premiership Placings.pdf',
        waybackTimestamp: null,
        year: 2011,
    },
    {
        sourceFilename: '2012 AMND Final Premiership Placings.pdf',
        waybackTimestamp: '20150505142829',
        year: 2012,
    },
    {
        sourceFilename: '2013 AMND Final Premiership Placings.pdf',
        waybackTimestamp: null,
        year: 2013,
    },
    {
        sourceFilename: '2014 AMND Final Premiership Placings.pdf',
        waybackTimestamp: null,
        year: 2014,
    },
    {
        sourceFilename: '2016 AMND Final Premiership Placings.pdf',
        waybackTimestamp: '20161020050124',
        year: 2016,
    },
];

function encodePathSegment(filename: string): string {
    return filename
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}

function buildOriginalUrl(filename: string): string {
    return `${ARCHIVE_BASE_URL}${encodePathSegment(filename)}`;
}

function buildWaybackUrl(
    timestamp: string | null,
    originalUrl: string,
): string {
    const lookupTimestamp = timestamp ?? '2';
    return `https://web.archive.org/web/${lookupTimestamp}id_/${originalUrl}`;
}

function buildSource(definition: SourceDefinition): ArchivePdfSource {
    const originalUrl = buildOriginalUrl(definition.sourceFilename);
    return {
        originalUrl,
        rawFilename: `${definition.year}-final-placings.pdf`,
        sourceFilename: definition.sourceFilename,
        waybackTimestamp: definition.waybackTimestamp,
        waybackUrl: buildWaybackUrl(definition.waybackTimestamp, originalUrl),
        year: definition.year,
    };
}

export const ARCHIVE_PDF_SOURCES: readonly ArchivePdfSource[] =
    DEFINITIONS.map(buildSource);

export const ARCHIVE_YEARS: readonly number[] = ARCHIVE_PDF_SOURCES.map(
    (source) => source.year,
);

const SOURCE_BY_YEAR = new Map(
    ARCHIVE_PDF_SOURCES.map((source) => [source.year, source]),
);

export function getArchivePdfSource(year: number): ArchivePdfSource | null {
    return SOURCE_BY_YEAR.get(year) ?? null;
}

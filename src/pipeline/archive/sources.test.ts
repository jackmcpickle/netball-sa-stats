import { describe, expect, it } from 'vitest';
import {
    ARCHIVE_PDF_SOURCES,
    ARCHIVE_YEARS,
    getArchivePdfSource,
} from '@/pipeline/archive/sources';

describe('archive PDF source catalogue', () => {
    it('contains exactly the archived AMND seasons', () => {
        expect(ARCHIVE_YEARS).toStrictEqual([
            2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010,
            2011, 2012, 2013, 2014, 2016,
        ]);
        expect(ARCHIVE_PDF_SOURCES).toHaveLength(16);
    });

    it('omits known gap years', () => {
        expect(getArchivePdfSource(2015)).toBeNull();
        expect(getArchivePdfSource(2017)).toBeNull();
        expect(getArchivePdfSource(2021)).toBeNull();
    });

    it('uses committed raw filenames and fixed Wayback id URLs', () => {
        const source = getArchivePdfSource(2016);

        expect(source).toMatchObject({
            year: 2016,
            sourceFilename: '2016 AMND Final Premiership Placings.pdf',
            rawFilename: '2016-final-placings.pdf',
            waybackTimestamp: '20161020050124',
        });
        expect(source?.originalUrl).toBe(
            'http://amnd.sa.netball.com.au/files/40002/files/2016%20AMND%20Final%20Premiership%20Placings.pdf',
        );
        expect(source?.waybackUrl).toBe(
            'https://web.archive.org/web/20161020050124id_/http://amnd.sa.netball.com.au/files/40002/files/2016%20AMND%20Final%20Premiership%20Placings.pdf',
        );
    });
});

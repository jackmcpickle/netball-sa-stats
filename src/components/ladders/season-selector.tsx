import type { ReactNode } from 'react';
import { FieldSelect } from '@/components/ui/select';

type SeasonSelectorProps = {
    readonly year: number | null;
    readonly options: readonly { value: number; label: string }[];
    readonly onValueChange: (year: number) => void;
};

/** Hidden once the dataset is empty — there is no year to select. */
export function SeasonSelector({
    year,
    options,
    onValueChange,
}: SeasonSelectorProps): ReactNode {
    if (year === null) {
        return null;
    }
    return (
        <FieldSelect
            label="Season"
            value={year}
            options={options}
            onValueChange={onValueChange}
        />
    );
}

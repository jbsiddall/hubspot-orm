import {
    COLLECTION_NAMES,
    CollHelperInternalArgs,
    CollectionInstance,
    META,
    ZOD_COLLECTIONS,
    SelectArg,
    DefaultSelectArg,
} from './common'
import z from 'zod'
import { __META__ } from '../generated'

interface FindManyArgs<Name extends COLLECTION_NAMES, S extends SelectArg<Name>> {
    select?: S,
    take?: number,
    skip?: number,
}

const SimpleObjectValidator = z.object({
    id: z.string(),
    properties: z.record(z.unknown()),
    createdAt: z.date(),
    updatedAt: z.date(),
    archived: z.boolean(),
})

const findMany = async <
        Name extends COLLECTION_NAMES,
        Props extends SelectArg<Name>,
        >(
        {collectionName, client}: CollHelperInternalArgs<Name>,
        {select, take, skip}: FindManyArgs<Name, Props>
        ): Promise<CollectionInstance<Name, Props>[]> => {

    if (take !== undefined && take < 0) {
        throw new Error(`take must be positive`)
    }
    if (skip !== undefined && skip < 0) {
        throw new Error(`skip must be positive`)
    }

    const response = await client.crm.objects.searchApi.doSearch(collectionName, {
        properties: Object.keys(select ?? {}),
        filterGroups: [],
        after: skip as any as number,
        sorts: [],
        limit: take as any as number,
    })
    const RawValidator: META['collectionProperties'][Name] = __META__.collectionProperties[collectionName]
    const collectionValidator = select === undefined ? RawValidator : RawValidator.pick(select as any)

    const rows = response.results.map(row => SimpleObjectValidator.parse(row)).map(row => ({
        ...row,
        properties: collectionValidator.parse(row.properties)
    }))
    return rows as any
}

export const collectionHelpers = <Name extends COLLECTION_NAMES>(internalArgs: CollHelperInternalArgs<Name>) => ({
    findMany<S extends SelectArg<Name>>(args: FindManyArgs<Name, S>) { return findMany(internalArgs, args) }
})
import {
  COLLECTION_NAMES,
  CollectionInstance,
  CollHelperInternalArgs,
  DefaultSelectArg,
  META,
  NoExtraKeys,
  SelectArg,
  WhereArg,
  ZOD_COLLECTIONS,
} from "./common.ts";
import { R, z } from "./deps.ts";
import { Filter, FilterGroup, searchObjects } from "../rest.ts";
import { __META__ } from "../generated.ts";

interface FindManyArgsBase<Name extends COLLECTION_NAMES> {
  select?: SelectArg<Name>;
  where?: WhereArg<Name>;
  take?: number;
  skip?: number;
}

type ValidateFindManyArgs<Args extends FindManyArgsBase<COLLECTION_NAMES>> = Args extends FindManyArgsBase<infer Name>
  ? {
    select?: Args["select"] extends (infer S extends SelectArg<Name>) ? NoExtraKeys<SelectArg<Name>, S> : "damm";
    where?: Args["where"] extends (infer S extends WhereArg<Name>) ? NoExtraKeys<WhereArg<Name>, S> : undefined;
    take?: number;
    skip?: number;
  }
  : never;

const SimpleObjectValidator = z.object({
  id: z.string(),
  properties: z.record(z.unknown()),
  createdAt: z.string().transform((x) => new Date(x)),
  updatedAt: z.string().transform((x) => new Date(x)),
  archived: z.boolean(),
});

type Helper<Name extends COLLECTION_NAMES, T extends undefined | SelectArg<Name>> = T extends undefined
  ? DefaultSelectArg<Name>
  : Exclude<T, undefined>;

const findMany =
  <Name extends COLLECTION_NAMES>({ collectionName, client }: CollHelperInternalArgs<Name>) =>
  async <const Arg extends FindManyArgsBase<Name>>(
    { select, where, take, skip }: Arg,
  ): Promise<CollectionInstance<Name, Helper<Name, Arg["select"]>>[]> => {
    if (take !== undefined && take < 0) {
      throw new Error(`take must be positive`);
    }

    if (skip !== undefined && skip < 0) {
      throw new Error(`skip must be positive`);
    }

    const filterGroups = whereClauseToFilterGroups({ where });

    const results = await searchObjects({
      axios: client,
      objectType: collectionName,
      properties: Object.keys(select ?? {}),
      filterGroups,
      after: skip as any as number,
      limit: take as any as number,
    });

    const RawValidator: META["collectionProperties"][Name] = __META__.collectionProperties[collectionName];
    // TODO remove any from following line
    const collectionValidator: typeof RawValidator = (RawValidator.pick as any)(select ?? []);

    const rows = results.map((row) => SimpleObjectValidator.parse(row)).map(
      (row) => ({
        ...row,
        properties: collectionValidator.parse(row.properties),
      }),
    );
    return rows as any;
  };

interface WhereClauseToFilterGroupsArgs<Name extends COLLECTION_NAMES> {
  where: WhereArg<Name> | undefined;
}

const whereClauseToFilterGroups = <Name extends COLLECTION_NAMES, Arg extends WhereClauseToFilterGroupsArgs<Name>>(
  { where }: Arg,
): FilterGroup[] => {
  const keys = where === undefined ? [] : R.keys(where);
  const filters: Filter[] = keys.reduce(
    (partialResults, key) => {
      if (typeof key === "symbol" || typeof key === "number") {
        throw new Error(`where clause key '${String(key)}' must be of type string`);
      }

      if (!where) {
        return partialResults;
      }
      const filter = where[key];

      if (!filter) {
        return partialResults;
      }

      const newPartial = [...partialResults];

      if ("equals" in filter) {
        if (filter.equals === null) {
          newPartial.push(
            { propertyName: key, operator: "NOT_HAS_PROPERTY" },
          );
        } else {
          newPartial.push(
            { propertyName: key, operator: "EQ", value: `${String(filter.equals)}` },
          );
        }
      }

      if ("not" in filter) {
        if (filter.not === null) {
          newPartial.push({ propertyName: key, operator: "HAS_PROPERTY" });
        } else {
          newPartial.push({
            propertyName: key,
            operator: "NEQ",
            value: `${String(filter.not)}`,
          });
        }
      }

      return newPartial;
    },
    [] as Filter[],
  );

  if (filters.length === 0) {
    return [];
  }

  return [{ filters }];
};

export const collectionHelpers = <Name extends COLLECTION_NAMES>(
  internalArgs: CollHelperInternalArgs<Name>,
) => ({
  findMany: findMany(internalArgs),
});

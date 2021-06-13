export type CPLType = '*' | ('find' | 'count' | 'get' | 'update' | 'create' | 'delete' /*| 'addField'*/)  []
export type FieldType =  'String'
  | 'Number'
  | 'Boolean'
  | 'Date'
  | 'File'
  | 'GeoPoint'
  | 'Polygon'
  | 'Array'
  | 'Object'
  | 'Pointer'
  | 'Relation';

interface FieldInterface {
  type: FieldType,
  targetClass?: string,
  required?: boolean,
  defaultValue?: any,
}

interface CPLInterface {
  requiresAuthentication?: boolean,
  '*'?: boolean,
}

interface IndexInterface {
  [key: string]: number,
}

interface FieldsInterface {
  [key: string]: FieldInterface,
}

interface ProtectedFieldsInterface {
  [key: string]: string[],
}

interface IndexesInterface {
  [key: string]: IndexInterface,
}

interface CPLsInterface {
  find?: CPLInterface,
  count?: CPLInterface,
  get?: CPLInterface,
  update?: CPLInterface,
  create?: CPLInterface,
  delete?: CPLInterface,
  addField?: CPLInterface,
  protectedFields?: ProtectedFieldsInterface
}

export interface SchemaInterface {
  fields: FieldsInterface,
  indexes: IndexesInterface,
  classLevelPermissions: CPLsInterface,
}


function CPL (ops: CPLType, value: CPLInterface): CPLsInterface {

  const v: CPLsInterface = {}

  if (ops === '*') {
    ops = [
      'find', 'count', 'get', 'update', 'create', 'delete',
    ]
  }

  ops.forEach(op => {
    v[op] = value
  })

  return v
}


export function requiresAuthentication (ops: CPLType): CPLsInterface {

  return CPL(ops, { requiresAuthentication: true })
}

export function requiresAnonymous (ops: CPLType): CPLsInterface {

  return CPL(ops, { '*': true })
}

export function makeSchema (className: string, schema: SchemaInterface): SchemaInterface {

  return {
    className,
    fields:                {
      objectId:  { type: 'String' },
      createdAt: {
        type: 'Date',
      },
      updatedAt: {
        type: 'Date',
      },
      ACL:       { type: 'ACL' },
      ...schema.fields,
    },
    indexes:               {
      objectId: { objectId: 1 },
      ...schema.indexes,
    },
    classLevelPermissions: {
      find:            {},
      count:           {},
      get:             {},
      update:          {},
      create:          {},
      delete:          {},
      addField:        {},
      protectedFields: {
        // '*': [
        //     'symbol',
        // ],
      },
      ...schema.classLevelPermissions,
    },
  }
}

export const runMigrations = async (localSchemas: SchemaInterface[]): Promise<void> => {
  const allCloudSchema = (await Parse.Schema.all()).filter(
    (s: any) => !lib.isDefaultSchema(s.className),
  )
  await Promise.all(
    localSchemas.map(async (localSchema) => lib.saveOrUpdate(allCloudSchema, localSchema)),
  )
}

const lib = {
  saveOrUpdate: async (allCloudSchema: any[], localSchema: any) => {
    const cloudSchema = allCloudSchema.find((sc) => sc.className === localSchema.className)
    if (cloudSchema) {
      await lib.updateSchema(localSchema, cloudSchema)
    } else {
      await lib.saveSchema(localSchema)
    }
  },
  saveSchema:   async (localSchema: any) => {
    const newLocalSchema = new Parse.Schema(localSchema.className)
    // Handle fields
    Object.keys(localSchema.fields)
      .filter((fieldName) => !lib.isDefaultFields(localSchema.className, fieldName))
      .forEach((fieldName) => {
        const { type, ...others } = localSchema.fields[fieldName]
        lib.handleFields(newLocalSchema, fieldName, type, others)
      })
    // Handle indexes
    if (localSchema.indexes) {
      Object.keys(localSchema.indexes)
        .forEach((indexName) => newLocalSchema.addIndex(indexName, localSchema.indexes[indexName]),
        )
    }

    newLocalSchema.setCLP(localSchema.classLevelPermissions)
    return newLocalSchema.save()
  },
  updateSchema: async (localSchema: any, cloudSchema: any) => {
    const newLocalSchema: any = new Parse.Schema(localSchema.className)

    // Handle fields
    // Check addition
    Object.keys(localSchema.fields)
      .filter((fieldName) => !lib.isDefaultFields(localSchema.className, fieldName))
      .forEach((fieldName) => {
        const { type, ...others } = localSchema.fields[fieldName]
        if (!cloudSchema.fields[fieldName]) {
          lib.handleFields(newLocalSchema, fieldName, type, others)
        }
      })

    // Check deletion
    await Promise.all(
      Object.keys(cloudSchema.fields)
        .filter((fieldName) => !lib.isDefaultFields(localSchema.className, fieldName))
        .map(async (fieldName) => {
          const field = cloudSchema.fields[fieldName]
          if (!localSchema.fields[fieldName]) {
            newLocalSchema.deleteField(fieldName)
            await newLocalSchema.update()
            return
          }
          const localField = localSchema.fields[fieldName]
          if (!lib.paramsAreEquals(field, localField)) {
            newLocalSchema.deleteField(fieldName)
            await newLocalSchema.update()

            const { type, ...others } = localField
            lib.handleFields(newLocalSchema, fieldName, type, others)
          }
        }),
    )

    // Handle Indexes
    // Check addition
    const cloudIndexes = lib.fixCloudIndexes(cloudSchema.indexes)

    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach((indexName) => {
        if (
          !cloudIndexes[indexName] &&
          !lib.isNativeIndex(localSchema.className, indexName)
        ) {
          newLocalSchema.addIndex(indexName, localSchema.indexes[indexName])
        }
      })
    }

    const indexesToAdd: any[] = []

    // Check deletion
    Object.keys(cloudIndexes).forEach(async (indexName) => {
      if (!lib.isNativeIndex(localSchema.className, indexName)) {
        if (!localSchema.indexes[indexName]) {
          newLocalSchema.deleteIndex(indexName)
        } else if (
          !lib.paramsAreEquals(localSchema.indexes[indexName], cloudIndexes[indexName])
        ) {
          newLocalSchema.deleteIndex(indexName)
          indexesToAdd.push({
            indexName,
            index: localSchema.indexes[indexName],
          })
        }
      }
    })

    newLocalSchema.setCLP(localSchema.classLevelPermissions)
    await newLocalSchema.update()
    indexesToAdd.forEach((o) => newLocalSchema.addIndex(o.indexName, o.index))
    return newLocalSchema.update()
  },

  isDefaultSchema: (className: string) => [
    '_Session', '_Role', '_PushStatus', '_Installation',
  ].indexOf(className) !== -1,

  isDefaultFields: (className: string, fieldName: string) => [
    'objectId',
    'createdAt',
    'updatedAt',
    'ACL',
    'emailVerified',
    'authData',
    'username',
    'password',
    'email',
  ]
    .filter(
      (value) => (className !== '_User' && value !== 'email') || className === '_User',
    )
    .indexOf(fieldName) !== -1,

  fixCloudIndexes: (cloudSchemaIndexes: any) => {
    if (!cloudSchemaIndexes) {
      return {}
    }
    const { _id_, ...others } = cloudSchemaIndexes

    return {
      objectId: { objectId: 1 },
      ...others,
    }
  },

  isNativeIndex: (className: string, indexName: string) => {
    if (className === '_User') {
      switch (indexName) {
        case 'username_1':
          return true
        case 'objectId':
          return true
        case 'email_1':
          return true
        default:
          break
      }
    }
    return false
  },

  paramsAreEquals: (indexA: any, indexB: any) => {
    const keysIndexA = Object.keys(indexA)
    const keysIndexB = Object.keys(indexB)

    // Check key name
    if (keysIndexA.length !== keysIndexB.length) {
      return false
    }
    return keysIndexA.every((k) => indexA[k] === indexB[k])
  },

  handleFields: (newLocalSchema: Parse.Schema, fieldName: string, type: string, others: any) => {
    if (type === 'Relation') {
      newLocalSchema.addRelation(fieldName, others.targetClass)
    } else if (type === 'Pointer') {
      const { targetClass, ...others2 } = others

      newLocalSchema.addPointer(fieldName, targetClass, others2)
    } else {

      newLocalSchema.addField(fieldName, type, others)
    }
  },
}

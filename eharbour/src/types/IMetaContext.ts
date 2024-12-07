export interface IMetaContext {
	parent?: IMetaContext
	children: IMetaContext[]
	definitions: string[]
	states: number[]
	isInvert: boolean
	startName: string
}

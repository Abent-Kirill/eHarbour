import * as fs from 'fs'

export async function readFile(path:string) {
	try{
		return await fs.promises.readFile(path);
	}
		catch (error){
	console.error(`Error reading file: ${error}`);
	throw error;
		}
}
// studioASK

let nomesArray = [];
let nomesString = '1Alice2Olivia3Astrid4Maja 5Vera 6Ebba 7Ella 8Wilma9Alma 10Lilly11Elsa12Agnes13Freja14Saga15Ellie16Clara 17Signe 18Alva 19Alicia 20Selma21Ester22Stella 23Julia24Ines25Leah26Ellen27Molly 28Iris 29Sara30Luna31Isabelle 31Nora31Nova 34Hedda35Mila36Nellie37Sofia 38Lova 39Juni40Elvira40Linnéa42Emilia43Sigrid 44Celine45Elise46Edith47Emma48Lykke49Liv 50Lo51Thea 52Meja53Livia 54Tuva55Isabella56Sally57Majken 58Maria59Leia60Hailey61Tyra 62Elin63Amelia 64Lovisa65Märta 66Rut67Ida67Ingrid69Bianca 69Hanna69Ronja72Jasmine73Stina 74Svea 75Cleo76Melissa 77Hilma78Filippa 78Hedvig 80Julie81Tilde 82Lovis83Siri84Felicia85Cornelia 85Elina 85Elsie88Joline89Hilda 89Mira89Moa 92Melina93Bonnie94Mariam95Matilda95Wilda97Bella98Millie99My 100Amanda 100Victoria91Lucas7682Liam7603William7324Elias 7295Noah6806Hugo 6697Oliver 6478Oscar6459Adam62010Matteo59611Walter57912Alexander 56313Leo 54814Nils 53915Alfred51016Ludvig 50517Adrian50318Theo 50219Leon 50020Elliot49821Arvid 48222Vincent47623Theodor47024Filip46525Axel 45526Harry45127Frans44828Charlie44429Mohamed43330Gabriel42331Isak 41332August40833Loui40334Benjamin 39835Sam37336Josef 37037Ebbe36738Melvin 35239Love 35040Olle 34941Albin 34742Henry34143Edvin 33844Elton32745Emil32046Malte31646Vidar31648Gustav 31149Jack30650Frank30451Viggo 30152Noel 29853Sixten 29554Viktor29155Melker 28256Jacob27457Casper 26758Erik 26259Tage25960Aron25761Loke 25562Otto25163Wilmer 24964Colin24665Milo23666Sigge23067Alvin22668Carl22268Milton 22270Wilhelm22071Anton21672Ivar21473Kian21274Julian20275Max 19976Elis 19577Levi19378Nicholas18779Elvin18580Felix18281Vilgot17682Ali17382Omar17384Hjalmar17184Ture17186Samuel16387David 15887Kevin15889Joel15790Vide15291Amir15091Ville15093Dante14993John14995Daniel14896Algot14696Folke14698Alve14099Ibrahim13899Thor138';
nomesString = nomesString.replace(/\s+/g, '');
nomesArray = nomesString.split(/\d+/);
for ( let i = 0; i < nomesArray.length; i++ ) { 
    if ( nomesArray[i] == '') nomesArray.splice(i, 1);
}
console.log(nomesArray.length);
console.log(nomesArray);

const { readdirSync, rename } = require('fs');
const { resolve } = require('path');

// Get path to image directory
const imageDirPath = resolve(__dirname, 'nomes');

// Get an array of the files inside the folder
const files = readdirSync(imageDirPath);

// Loop through each file that was retrieved
for ( let i = 0; i < nomesArray.length; i++ ) { 
    rename(
        imageDirPath + `/${i}.png`,
        imageDirPath + `/${nomesArray[i]}.png`,
        err => console.log(err)
      );
}
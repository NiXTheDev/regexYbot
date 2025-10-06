// hellspawn.ts
import { exit } from "node:process";

/**
 * Performs a regex substitution based on command-line arguments.
 *
 * Arguments:
 * 1. text (string): The target text to perform the replacement on.
 * 2. pattern (string): The regex pattern.
 * 3. flags (string): The regex flags (e.g., 'g', 'i').
 * 4. replacement (string): The replacement string (can contain $1, $2, etc.).
 *
 * Outputs:
 * - On success: The resulting text is printed to stdout.
 * - On error: An error message is printed to stderr, and the process exits with code 1.
 * - If arguments are missing: An error message is printed to stderr, and the process exits with code 2.
 */

function main() {
    const args = Bun.argv; // Bun's equivalent of process.argv

    // args[0] is 'bun', args[1] is this script name, args[2+] are our arguments
    if (args.length < 6) {
        console.error("Usage: bun perform_regex.ts <text> <pattern> <flags> <replacement>");
        exit(2); // Exit code 2 for incorrect usage
    }

    const text = args[2];
    const pattern = args[3];
    const flags = args[4];
    const replacement = args[5]; // This should already be the processed replacement string ($1, $2, etc.)

    try {
        const regex = new RegExp(pattern, flags);
        const result = text.replace(regex, replacement);
        console.log(result); // Output the result to stdout
        exit(0); // Exit successfully
    } catch (error: any) {
        console.error(`Error during substitution: ${error.message}`); // Output error to stderr
        exit(1); // Exit with error code 1
    }
}

main();
